const http = require('http');

let cookieJar = '';

function request(method, path, body, useCookie = true) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 4000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(useCookie && cookieJar ? { Cookie: cookieJar } : {})
      }
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.headers['set-cookie']) {
          cookieJar = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        }
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const ts = Date.now();
  
  // Register
  const r1 = await request('POST', '/api/auth/register', {
    name: 'Debug User', email: `debug${ts}@test.com`,
    user_id: `debug${ts}`, password: 'Test@1234'
  }, false);
  console.log('Register:', r1.status, r1.body?.user?.user_id);
  console.log('Cookie after register:', cookieJar.slice(0, 50));

  // Create project
  const r2 = await request('POST', '/api/project', {
    title: 'Debug Project', project_text: 'test'
  });
  const pid = r2.body?.id;
  console.log('Create project:', r2.status, pid);

  // Check /me
  const r3 = await request('GET', '/api/auth/me');
  console.log('GET /me:', r3.status, r3.body?.user?.user_id);

  // Delete project
  const r4 = await request('DELETE', `/api/project/${pid}`);
  console.log('Delete project:', r4.status, JSON.stringify(r4.body));

  // Verify deleted
  const r5 = await request('GET', `/api/project/${pid}`);
  console.log('Get deleted project:', r5.status, JSON.stringify(r5.body));
}

main().catch(console.error);
