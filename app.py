#!/usr/bin/env python3
"""
SQLi Workbench — Lightweight Flask CORS Proxy Backend
Acts as a transparent HTTP proxy so the frontend can send requests
to arbitrary targets without browser Same-Origin Policy restrictions.
"""

import re
import socket
import time
import traceback
from urllib.parse import urlparse

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import urllib3

# Suppress InsecureRequestWarning when verify=False
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)  # Allow all origins for local development

# Reasonable defaults for a manual testing tool
DEFAULT_TIMEOUT = 30  # seconds
MAX_RESPONSE_SIZE = 5 * 1024 * 1024  # 5 MB soft

# In-memory traffic stats per upstream proxy URL (process lifetime)
# { proxy_url: { "bytes_sent": int, "bytes_recv": int } }
PROXY_STATS = {}


def _normalize_proxy_url(proxy: str) -> str:
    p = (proxy or "").strip()
    if not p:
        return ""
    if "://" not in p:
        p = "http://" + p
    return p


def _requests_proxies(proxy: str):
    """Build requests 'proxies' dict for HTTP(S) upstream proxies (Burp/ZAP/…)."""
    p = _normalize_proxy_url(proxy)
    if not p:
        return None
    return {"http": p, "https": p}


def _record_proxy_traffic(proxy: str, sent: int, recv: int):
    p = _normalize_proxy_url(proxy)
    if not p:
        return
    slot = PROXY_STATS.setdefault(p, {"bytes_sent": 0, "bytes_recv": 0})
    slot["bytes_sent"] += max(0, int(sent or 0))
    slot["bytes_recv"] += max(0, int(recv or 0))


def _proxy_stats_payload(proxy: str):
    p = _normalize_proxy_url(proxy)
    if not p:
        return None
    slot = PROXY_STATS.get(p) or {"bytes_sent": 0, "bytes_recv": 0}
    return {
        "proxy": p,
        "bytes_sent": slot["bytes_sent"],
        "bytes_recv": slot["bytes_recv"],
    }


def _base_href_for(target_url: str) -> str:
    parsed = urlparse(target_url)
    path = parsed.path or "/"
    if not path.endswith("/") and "/" in path:
        path = path.rsplit("/", 1)[0] + "/"
    elif not path.endswith("/"):
        path = path + "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def inject_base_tag(html: str, target_url: str) -> str:
    """
    Inject <base href="..."> so relative CSS/JS/images resolve against the target.

    Prefer lightweight regex injection to avoid BeautifulSoup rewriting <script>
    bodies (which often breaks site UI JS). Fall back to BS only when needed.
    """
    try:
        base_href = _base_href_for(target_url)
        base_tag = f'<base href="{base_href}">'

        # Drop existing base tags (good enough for preview)
        html_wo_base = re.sub(
            r"<base\b[^>]*/?>",
            "",
            html,
            flags=re.IGNORECASE,
        )

        # Prefer injecting right after <head ...>
        head_match = re.search(r"<head\b[^>]*>", html_wo_base, flags=re.IGNORECASE)
        if head_match:
            i = head_match.end()
            return html_wo_base[:i] + "\n" + base_tag + html_wo_base[i:]

        # No <head>: insert after <html> or wrap
        html_match = re.search(r"<html\b[^>]*>", html_wo_base, flags=re.IGNORECASE)
        if html_match:
            i = html_match.end()
            return (
                html_wo_base[:i]
                + f"\n<head>{base_tag}</head>"
                + html_wo_base[i:]
            )

        return f"<html><head>{base_tag}</head><body>{html_wo_base}</body></html>"
    except Exception:
        return html


@app.route("/api/send-payload", methods=["POST"])
def send_payload():
    """
    Proxy endpoint.
    Expects JSON:
    {
        "url": "http://target.com/page.php?id=1",
        "method": "GET" | "POST",
        "headers": { "User-Agent": "...", "Cookie": "..." },
        "post_data": "key=value&..."   // optional, used when method == POST
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON body"}), 400

    url = (data.get("url") or "").strip()
    method = (data.get("method") or "GET").upper()
    headers = data.get("headers") or {}
    post_data = data.get("post_data")
    proxy = _normalize_proxy_url(data.get("proxy") or "")

    if not url:
        return jsonify({"error": "Missing required field: url"}), 400

    if method not in ("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"):
        return jsonify({"error": f"Unsupported HTTP method: {method}"}), 400

    # Basic URL validation
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return jsonify({"error": "Invalid URL — must include scheme and host"}), 400
    except Exception:
        return jsonify({"error": "Invalid URL"}), 400

    # Build request kwargs
    req_kwargs = {
        "method": method,
        "url": url,
        "headers": headers,
        "timeout": DEFAULT_TIMEOUT,
        "verify": False,          # allow self-signed certs
        "allow_redirects": True,
        "stream": True,           # so we can limit body size
    }
    proxies = _requests_proxies(proxy)
    if proxies:
        req_kwargs["proxies"] = proxies

    body_bytes = 0
    if method in ("POST", "PUT", "PATCH") and post_data is not None:
        # Send as raw body (application/x-www-form-urlencoded style string)
        req_kwargs["data"] = post_data
        body_bytes = len(post_data.encode("utf-8", errors="replace")) if isinstance(post_data, str) else len(post_data or b"")
        # Only set Content-Type if the user didn't already provide one
        if "Content-Type" not in {k.title(): v for k, v in headers.items()}:
            headers.setdefault("Content-Type", "application/x-www-form-urlencoded")

    start = time.perf_counter()

    try:
        with requests.request(**req_kwargs) as resp:
            # Read body with size limit
            content = b""
            for chunk in resp.iter_content(chunk_size=65536):
                content += chunk
                if len(content) > MAX_RESPONSE_SIZE:
                    content = content[:MAX_RESPONSE_SIZE]
                    break

            elapsed_ms = round((time.perf_counter() - start) * 1000)

            # Decode body
            charset = resp.encoding or "utf-8"
            try:
                raw_body = content.decode(charset, errors="replace")
            except Exception:
                raw_body = content.decode("utf-8", errors="replace")

            # Prepare headers dict (requests gives CaseInsensitiveDict)
            resp_headers = {k: v for k, v in resp.headers.items()}

            # Inject <base> only for HTML-like responses
            content_type = resp_headers.get("Content-Type", "").lower()
            if "text/html" in content_type or raw_body.lstrip().lower().startswith(("<!doctype", "<html")):
                fixed_html = inject_base_tag(raw_body, url)
            else:
                fixed_html = raw_body

            if proxy:
                # Approximate request size (URL + headers + body)
                hdr_approx = sum(len(str(k)) + len(str(v)) + 4 for k, v in (headers or {}).items())
                _record_proxy_traffic(proxy, len(url) + hdr_approx + body_bytes, len(content))

            return jsonify({
                "status_code": resp.status_code,
                "status_text": resp.reason or "",
                "response_time_ms": elapsed_ms,
                "headers": resp_headers,
                "raw_body": raw_body,
                "fixed_html": fixed_html,
                "final_url": resp.url,          # after redirects
                "content_length": len(content),
                "proxy_stats": _proxy_stats_payload(proxy) if proxy else None,
            })

    except requests.exceptions.Timeout:
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        return jsonify({
            "error": "Request timed out",
            "response_time_ms": elapsed_ms,
            "status_code": 0,
        }), 504

    except requests.exceptions.ConnectionError as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        return jsonify({
            "error": f"Connection error: {str(e)}",
            "response_time_ms": elapsed_ms,
            "status_code": 0,
        }), 502

    except requests.exceptions.TooManyRedirects:
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        return jsonify({
            "error": "Too many redirects",
            "response_time_ms": elapsed_ms,
            "status_code": 0,
        }), 502

    except requests.exceptions.RequestException as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000)
        return jsonify({
            "error": f"Request failed: {str(e)}",
            "response_time_ms": elapsed_ms,
            "status_code": 0,
        }), 502

    except Exception as e:
        # Catch-all so the server never returns a raw 500 traceback to the UI
        traceback.print_exc()
        return jsonify({
            "error": f"Internal proxy error: {str(e)}",
            "status_code": 0,
        }), 500


@app.route("/api/health", methods=["GET"])
def health():
    """Simple health-check endpoint."""
    return jsonify({"status": "ok", "service": "sqli-workbench-proxy"})


@app.route("/api/proxy/ping", methods=["POST"])
def proxy_ping():
    """
    Check whether an upstream proxy is reachable.
    JSON: { "proxy": "http://127.0.0.1:8080" }

    Strategy (Burp/ZAP friendly):
      1) TCP connect to host:port (is the listener up?)
      2) Optional HTTP GET *through* the proxy to a tiny captive-portal URL
         (works even when Intercept is on for other hosts if that host isn't matched)
    """
    data = request.get_json(silent=True) or {}
    proxy = _normalize_proxy_url(data.get("proxy") or "")
    if not proxy:
        return jsonify({"error": "Missing proxy URL", "ok": False}), 400

    parsed = urlparse(proxy)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if not host:
        return jsonify({"error": "Invalid proxy URL", "ok": False}), 400

    result = {
        "ok": False,
        "proxy": proxy,
        "tcp_ok": False,
        "http_ok": False,
        "latency_ms": None,
        "error": None,
        "proxy_stats": _proxy_stats_payload(proxy),
    }

    # 1) TCP probe
    t0 = time.perf_counter()
    try:
        with socket.create_connection((host, int(port)), timeout=3.0):
            result["tcp_ok"] = True
    except OSError as e:
        result["error"] = f"TCP connect failed: {e}"
        result["latency_ms"] = round((time.perf_counter() - t0) * 1000)
        return jsonify(result)

    tcp_ms = round((time.perf_counter() - t0) * 1000)

    # 2) HTTP via proxy — lightweight endpoint; timeout short
    proxies = _requests_proxies(proxy)
    t1 = time.perf_counter()
    try:
        r = requests.get(
            "http://detectportal.firefox.com/success.txt",
            proxies=proxies,
            timeout=5,
            verify=False,
            allow_redirects=True,
        )
        result["http_ok"] = r.status_code < 500
        result["http_status"] = r.status_code
        result["latency_ms"] = round((time.perf_counter() - t1) * 1000)
        result["ok"] = bool(result["tcp_ok"] and result["http_ok"])
        if not result["http_ok"]:
            result["error"] = f"HTTP via proxy returned {r.status_code}"
    except requests.exceptions.RequestException as e:
        # TCP worked — proxy port is open (typical for Burp with intercept quirks)
        result["latency_ms"] = tcp_ms
        result["ok"] = True  # port open counts as usable for manual testing
        result["error"] = f"HTTP probe failed (TCP ok): {e}"
        result["http_ok"] = False

    return jsonify(result)


@app.route("/api/proxy/stats", methods=["GET"])
def proxy_stats():
    """Return traffic counters for one proxy (?proxy=) or all."""
    proxy = _normalize_proxy_url(request.args.get("proxy") or "")
    if proxy:
        return jsonify(_proxy_stats_payload(proxy) or {
            "proxy": proxy, "bytes_sent": 0, "bytes_recv": 0
        })
    return jsonify({"stats": [
        {"proxy": k, **v} for k, v in PROXY_STATS.items()
    ]})


@app.route("/")
def index():
    """Serve the frontend UI."""
    return app.send_static_file("index.html")


if __name__ == "__main__":
    # threaded=True so concurrent attack requests from the UI don't block each other
    print("[*] SQLi Workbench Proxy listening on http://127.0.0.1:5000")
    print("[*] Frontend: open http://127.0.0.1:5000/  (or use Live Server + this API)")
    print("[*] Concurrent requests enabled (threaded)")
    app.run(host="127.0.0.1", port=5000, debug=True, threaded=True)
