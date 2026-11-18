import { execSync } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(rootDir, "dist");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log("==> [1/3] Building @workspace/api-server...");
  execSync("npm run build --workspace=@workspace/api-server", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  console.log("==> [2/3] Building @workspace/luxe-boutique-admin (Admin Portal)...");
  execSync("npm run build --workspace=@workspace/luxe-boutique-admin", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production", PORT: "3000", BASE_PATH: "/seller/" },
  });

  console.log("==> [3/3] Assembling unified dist/ directory...");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const adminDist = path.resolve(rootDir, "artifacts/luxe-boutique-admin/dist/public");
  if (await exists(adminDist)) {
    console.log("  -> Copying Admin Portal files to dist/seller/ and root dist/...");
    const distAdmin = path.resolve(distDir, "seller");
    await mkdir(distAdmin, { recursive: true });
    await cp(adminDist, distAdmin, { recursive: true });
    // Also copy to root dist so root serves admin portal
    await cp(adminDist, distDir, { recursive: true });
  }

  const serverDist = path.resolve(rootDir, "artifacts/api-server/dist");
  if (await exists(serverDist)) {
    console.log("  -> Copying API Server bundle to dist/server/...");
    const distServer = path.resolve(distDir, "server");
    await mkdir(distServer, { recursive: true });
    await cp(serverDist, distServer, { recursive: true });
  }



  // Copy .env.example into dist/ and dist/server/
  const envExample = path.resolve(rootDir, ".env.example");
  if (await exists(envExample)) {
    await cp(envExample, path.resolve(distDir, ".env.example"));
    if (await exists(path.resolve(distDir, "server"))) {
      await cp(envExample, path.resolve(distDir, "server/.env.example"));
    }
  }

  // Copy deployment guide and license
  const deployGuide = path.resolve(rootDir, "DEPLOYMENT-GUIDE.md");
  if (await exists(deployGuide)) {
    await cp(deployGuide, path.resolve(distDir, "DEPLOYMENT-GUIDE.md"));
    await cp(deployGuide, path.resolve(distDir, "README.md"));
  }

  const comprehensiveDeployGuide = path.resolve(rootDir, "DEPLOYMENT.md");
  if (await exists(comprehensiveDeployGuide)) {
    await cp(comprehensiveDeployGuide, path.resolve(distDir, "DEPLOYMENT.md"));
  }

  const defaultLicense = path.resolve(rootDir, "LICENSE-EXCLUSIVE-SOURCE-CODE.md");
  if (await exists(defaultLicense)) {
    await cp(defaultLicense, path.resolve(distDir, "LICENSE"));
    await cp(defaultLicense, path.resolve(distDir, "LICENSE.md"));
  }

  console.log("==> Production build successfully completed!");
}

run().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
