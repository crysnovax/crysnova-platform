// ═══════════════════════════════════════════════════════════════
// CRYSNOVA PLATFORM - COMPLETE WORKER (ALL IN ONE FILE)
// Just paste this entire file into Cloudflare Workers dashboard!
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE, PUT",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    // ═══════════════════════════════════════════════════
    // 🔐 ADMIN AUTHENTICATION
    // ═══════════════════════════════════════════════════
    
    function isAdmin(request) {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader) return false
      
      const token = authHeader.replace('Bearer ', '')
      return token === env.ADMIN_SECRET
    }

    // ═══════════════════════════════════════════════════
    // 🏠 HOMEPAGE
    // ═══════════════════════════════════════════════════
    
    if (path === "/" || path === "/home") {
      return new Response(getHomepage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }

    // ═══════════════════════════════════════════════════
    // 🔌 GET APPROVED PLUGINS (PUBLIC)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/plugins") {
      try {
        const list = await env.PLUGINS.list()
        const plugins = []
        
        for (const key of list.keys) {
          if (key.name.startsWith('approved_')) {
            const data = await env.PLUGINS.get(key.name)
            if (data) {
              plugins.push(JSON.parse(data))
            }
          }
        }
        
        plugins.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        
        return new Response(JSON.stringify({
          success: true,
          plugins: plugins,
          total: plugins.length
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📋 GET PENDING PLUGINS (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/pending" && request.method === "GET") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const list = await env.PLUGINS.list()
        const pending = []
        
        for (const key of list.keys) {
          if (key.name.startsWith('pending_')) {
            const data = await env.PLUGINS.get(key.name)
            if (data) {
              pending.push(JSON.parse(data))
            }
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          plugins: pending,
          total: pending.length
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ✅ APPROVE PLUGIN (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/approve" && request.method === "POST") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const { pluginId } = await request.json()
        
        const pendingData = await env.PLUGINS.get(`pending_${pluginId}`)
        
        if (!pendingData) {
          return new Response(JSON.stringify({
            success: false,
            error: "Plugin not found"
          }), {
            status: 404,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }
        
        const plugin = JSON.parse(pendingData)
        plugin.status = 'approved'
        plugin.approvedAt = Date.now()
        
        await env.PLUGINS.put(`approved_${pluginId}`, JSON.stringify(plugin))
        await env.PLUGINS.delete(`pending_${pluginId}`)
        
        return new Response(JSON.stringify({
          success: true,
          message: "Plugin approved!"
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ❌ REJECT PLUGIN (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/reject" && request.method === "POST") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const { pluginId } = await request.json()
        await env.PLUGINS.delete(`pending_${pluginId}`)
        
        return new Response(JSON.stringify({
          success: true,
          message: "Plugin rejected!"
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ✉️ SUBMIT PLUGIN (Goes to PENDING)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/submit" && request.method === "POST") {
      try {
        const body = await request.json()
        
        const { name, description, category, code, author, version } = body
        
        if (!name || !description || !code) {
          return new Response(JSON.stringify({
            success: false,
            error: "Missing required fields: name, description, code"
          }), {
            status: 400,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }

        const pluginId = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
        
        const pluginData = {
          id: pluginId,
          name: name,
          description: description,
          category: category || 'general',
          code: code,
          author: author || 'Anonymous',
          version: version || '1.0.0',
          downloads: 0,
          status: 'pending',
          createdAt: Date.now(),
          installCommand: `.plugin ${url.origin}/plugin/${pluginId}`
        }
        
        await env.PLUGINS.put(`pending_${pluginId}`, JSON.stringify(pluginData))
        
        return new Response(JSON.stringify({
          success: true,
          plugin: pluginData,
          message: "Plugin submitted! Pending admin approval."
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📦 GET APPROVED PLUGIN BY ID
    // ═══════════════════════════════════════════════════
    
    if (path.startsWith("/plugin/")) {
      const pluginId = path.split("/plugin/")[1]
      
      try {
        const plugin = await env.PLUGINS.get(`approved_${pluginId}`)
        
        if (!plugin) {
          return new Response(JSON.stringify({
            success: false,
            error: "Plugin not found or not approved"
          }), {
            status: 404,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }
        
        const pluginData = JSON.parse(plugin)
        
        pluginData.downloads = (pluginData.downloads || 0) + 1
        await env.PLUGINS.put(`approved_${pluginId}`, JSON.stringify(pluginData))
        
        return new Response(JSON.stringify({
          success: true,
          plugin: pluginData
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 🎨 PAGES
    // ═══════════════════════════════════════════════════
    
    if (path === "/admin" || path === "/admin/") {
      return new Response(getAdminDashboard(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/plugins" || path === "/plugins/") {
      return new Response(getPluginsPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/submit" || path === "/submit/") {
      return new Response(getSubmitPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/deploy" || path === "/deploy/") {
      return new Response(getDeployPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }

    return new Response("Not found", { status: 404 })
  }
}

// ═══════════════════════════════════════════════════════════════
// HTML PAGES BELOW - All pages in one file!
// ═══════════════════════════════════════════════════════════════

function getHomepage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRYSNOVA AI - WhatsApp Bot Platform</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      min-height: 100vh;
    }
    
    nav {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 20px 0;
    }
    .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 1.8rem;
      font-weight: 800;
    }
    .nav-links {
      display: flex;
      gap: 30px;
    }
    .nav-links a {
      color: white;
      text-decoration: none;
      font-weight: 600;
    }
    
    .hero {
      text-align: center;
      padding: 100px 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 4rem;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .tagline {
      font-size: 1.5rem;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    .btn {
      padding: 18px 40px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      display: inline-block;
      margin: 10px;
    }
    .btn-primary {
      background: white;
      color: #667eea;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 2px solid white;
    }
  </style>
</head>
<body>
  <nav>
    <div class="nav-container">
      <div class="logo">⚉ CRYSNOVA AI</div>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/plugins">Plugins</a>
        <a href="/submit">Submit</a>
        <a href="/admin">Admin</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <h1>CRYSNOVA AI</h1>
    <p class="tagline">The Most Advanced WhatsApp Bot Platform</p>
    <div>
      <a href="/plugins" class="btn btn-primary">Browse Plugins</a>
      <a href="/submit" class="btn btn-secondary">Submit Plugin</a>
    </div>
  </section>
</body>
</html>`
}

function getAdminDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .login-card {
      background: white;
      border-radius: 15px;
      padding: 40px;
      max-width: 400px;
      margin: 100px auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .btn {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .dashboard { display: none; }
    .plugin-item {
      background: white;
      padding: 20px;
      margin: 15px;
      border-radius: 10px;
      border: 2px solid #f0f0f0;
    }
    .btn-approve { background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 6px; margin: 5px; cursor: pointer; }
    .btn-reject { background: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 6px; margin: 5px; cursor: pointer; }
    .code-preview {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.85rem;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Admin Dashboard</h1>
  </div>

  <div id="loginForm" class="login-card">
    <h2>🔐 Admin Login</h2>
    <input type="password" id="adminToken" placeholder="Enter admin password">
    <button class="btn" onclick="login()">Login</button>
  </div>

  <div id="dashboard" class="dashboard">
    <h2 style="text-align:center;margin:30px;">⏳ Pending Plugins</h2>
    <div id="pendingPlugins"></div>
  </div>

  <script>
    let adminToken = '';

    function login() {
      adminToken = document.getElementById('adminToken').value;
      if (!adminToken) return alert('Enter password!');
      loadDashboard();
    }

    async function loadDashboard() {
      try {
        const response = await fetch('/api/admin/pending', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        
        const data = await response.json();
        
        if (!data.success) {
          alert('Invalid password!');
          return;
        }
        
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        displayPlugins(data.plugins);
        
      } catch (error) {
        alert('Login failed: ' + error.message);
      }
    }

    function displayPlugins(plugins) {
      const container = document.getElementById('pendingPlugins');
      
      if (plugins.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">No pending plugins</p>';
        return;
      }
      
      container.innerHTML = plugins.map(plugin => \`
        <div class="plugin-item">
          <h3>\${plugin.name}</h3>
          <p><strong>Category:</strong> \${plugin.category} | <strong>Author:</strong> \${plugin.author}</p>
          <p>\${plugin.description}</p>
          <details>
            <summary style="cursor:pointer;color:#667eea;margin:10px 0;">View Code</summary>
            <div class="code-preview">\${plugin.code}</div>
          </details>
          <button class="btn-approve" onclick="approvePlugin('\${plugin.id}')">✅ Approve</button>
          <button class="btn-reject" onclick="rejectPlugin('\${plugin.id}')">❌ Reject</button>
        </div>
      \`).join('');
    }

    async function approvePlugin(pluginId) {
      if (!confirm('Approve this plugin?')) return;
      
      try {
        const response = await fetch('/api/admin/approve', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginId })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert('✅ Plugin approved!');
          loadDashboard();
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function rejectPlugin(pluginId) {
      if (!confirm('Reject this plugin?')) return;
      
      try {
        const response = await fetch('/api/admin/reject', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginId })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert('❌ Plugin rejected!');
          loadDashboard();
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>`
}

function getPluginsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Plugins - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    h1 { font-size: 3rem; }
    .plugins-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 25px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .plugin-card {
      background: white;
      border-radius: 20px;
      padding: 25px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .plugin-card h3 {
      color: #333;
      margin-bottom: 10px;
    }
    .plugin-description {
      color: #666;
      margin-bottom: 15px;
    }
    .install-command {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 10px;
      margin-top: 15px;
    }
    .install-command input {
      width: 100%;
      padding: 10px;
      border: 2px solid #ddd;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
    }
    .copy-btn {
      margin-top: 10px;
      width: 100%;
      padding: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔌 Plugin Marketplace</h1>
    <p style="font-size: 1.2rem;">Extend your bot with powerful plugins</p>
  </div>
  
  <div class="plugins-grid" id="pluginsGrid">
    <p style="color:white;text-align:center;">Loading plugins...</p>
  </div>

  <script>
    async function loadPlugins() {
      try {
        const response = await fetch('/api/plugins');
        const data = await response.json();
        
        if (data.success && data.plugins.length > 0) {
          displayPlugins(data.plugins);
        } else {
          document.getElementById('pluginsGrid').innerHTML = '<p style="color:white;text-align:center;">No plugins yet. Be the first to submit!</p>';
        }
      } catch (error) {
        document.getElementById('pluginsGrid').innerHTML = '<p style="color:white;text-align:center;">Error loading plugins</p>';
      }
    }
    
    function displayPlugins(plugins) {
      document.getElementById('pluginsGrid').innerHTML = plugins.map(plugin => \`
        <div class="plugin-card">
          <h3>\${plugin.name}</h3>
          <p class="plugin-description">\${plugin.description}</p>
          <p style="color:#999;font-size:0.9rem;">
            👤 \${plugin.author} | 📦 v\${plugin.version} | ⬇️ \${plugin.downloads || 0}
          </p>
          <div class="install-command">
            <label style="font-weight:600;margin-bottom:8px;display:block;">Install Command:</label>
            <input type="text" value="\${plugin.installCommand}" readonly>
            <button class="copy-btn" onclick="copyCommand('\${plugin.installCommand}')">Copy</button>
          </div>
        </div>
      \`).join('');
    }
    
    function copyCommand(command) {
      navigator.clipboard.writeText(command);
      event.target.textContent = '✅ Copied!';
      setTimeout(() => { event.target.textContent = 'Copy'; }, 2000);
    }
    
    loadPlugins();
  </script>
</body>
</html>`
}

function getSubmitPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Submit Plugin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    h1 { font-size: 3rem; margin-bottom: 15px; }
    .form-card {
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .form-group {
      margin-bottom: 25px;
    }
    label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 8px;
    }
    input, select, textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
    }
    textarea {
      min-height: 150px;
      font-family: monospace;
    }
    .submit-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1.1rem;
      cursor: pointer;
    }
    .success, .error {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .success {
      background: #d4edda;
      color: #155724;
    }
    .error {
      background: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✉️ Submit Plugin</h1>
      <p style="font-size: 1.2rem;">Share your plugin with the community</p>
    </div>
    
    <div class="form-card">
      <div class="success" id="successMsg"></div>
      <div class="error" id="errorMsg"></div>
      
      <form id="submitForm">
        <div class="form-group">
          <label>Plugin Name *</label>
          <input type="text" name="name" required placeholder="e.g., Advanced Sticker Maker">
        </div>
        
        <div class="form-group">
          <label>Description *</label>
          <textarea name="description" required placeholder="Describe what your plugin does..."></textarea>
        </div>
        
        <div class="form-group">
          <label>Category *</label>
          <select name="category" required>
            <option value="">Select category...</option>
            <option value="utility">Utility</option>
            <option value="fun">Fun</option>
            <option value="admin">Admin</option>
            <option value="media">Media</option>
            <option value="ai">AI</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Plugin Code *</label>
          <textarea name="code" required placeholder="module.exports = { ... }"></textarea>
        </div>
        
        <div class="form-group">
          <label>Author Name</label>
          <input type="text" name="author" placeholder="Your name">
        </div>
        
        <div class="form-group">
          <label>Version</label>
          <input type="text" name="version" placeholder="1.0.0">
        </div>
        
        <button type="submit" class="submit-btn">Submit Plugin</button>
      </form>
    </div>
  </div>

  <script>
    document.getElementById('submitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = e.target.querySelector('.submit-btn');
      const successMsg = document.getElementById('successMsg');
      const errorMsg = document.getElementById('errorMsg');
      
      successMsg.style.display = 'none';
      errorMsg.style.display = 'none';
      
      btn.disabled = true;
      btn.textContent = '⏳ Submitting...';
      
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      
      try {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          successMsg.textContent = '✅ ' + result.message;
          successMsg.style.display = 'block';
          e.target.reset();
        } else {
          errorMsg.textContent = '❌ ' + result.error;
          errorMsg.style.display = 'block';
        }
      } catch (error) {
        errorMsg.textContent = '❌ Error: ' + error.message;
        errorMsg.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Plugin';
      }
    });
  </script>
</body>
</html>`
}

function getDeployPage() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Deploy - CRYSNOVA AI</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    h1 { font-size: 3rem; }
    p { font-size: 1.2rem; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>🚀 Deploy CRYSNOVA AI</h1>
  <p>Deployment guide coming soon!</p>
  <p>For now, visit <a href="/" style="color:white;">Homepage</a></p>
</body>
</html>`
}
