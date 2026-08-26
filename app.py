#!/usr/bin/env python3
"""
SQLi Workbench — Lightweight Flask CORS Proxy Backend
Acts as a transparent HTTP proxy so the frontend can send requests
to arbitrary targets without browser Same-Origin Policy restrictions.
"""

import re
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

    if method in ("POST", "PUT", "PATCH") and post_data is not None:
        # Send as raw body (application/x-www-form-urlencoded style string)
        req_kwargs["data"] = post_data
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

            return jsonify({
                "status_code": resp.status_code,
                "status_text": resp.reason or "",
                "response_time_ms": elapsed_ms,
                "headers": resp_headers,
                "raw_body": raw_body,
                "fixed_html": fixed_html,
                "final_url": resp.url,          # after redirects
                "content_length": len(content),
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
