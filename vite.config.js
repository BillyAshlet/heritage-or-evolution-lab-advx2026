import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS by default: iOS DeviceMotion only works in a secure context, and
// the phone is the primary device. `npm run dev:http` opts out for local
// preview tooling that can't handle the self-signed cert.
export default defineConfig({
  // 绝对资源路径。本项目独占 advx.billyashlet.com 的根，不需要「能挂在
  // 任意子路径」那份灵活性，而 base:'./' 会和 /tutorial 这类真实路径路由
  // 打架：相对资源按当前 URL 目录解析，/tutorial 侥幸解析对，/tutorial/
  // 就会去要 /tutorial/assets/* 全部 404。改成 '/' 后无论几层路径、有没有
  // 结尾斜杠，资源一律解析到 /assets/*。
  // ⚠️ 前提是部署在域名根。若将来要挂到子路径，这里和 vercel.json 的
  // rewrite 要一起改。
  base: '/',
  plugins: process.env.NO_HTTPS ? [] : [basicSsl()],
  server: {
    // Honor PORT when preview tooling assigns one; default stays 5173.
    port: Number(process.env.PORT) || 5173,
  },
});
