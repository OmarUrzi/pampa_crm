import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function run(cmd: string, args: string[], opts: { cwd?: string } = {}) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`cmd_failed:${cmd} ${args.join(" ")} code=${code} stderr=${err.slice(0, 2000)} stdout=${out.slice(0, 2000)}`));
    });
  });
}

export async function pptxBytesToPdfBytes(pptxBytes: Uint8Array): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pptx2pdf-"));
  try {
    const inPath = path.join(dir, "guide.pptx");
    const outDir = dir;
    await fs.writeFile(inPath, Buffer.from(pptxBytes));

    // libreoffice writes output file into outdir; name based on input.
    await run("soffice", ["--headless", "--nologo", "--nodefault", "--norestore", "--convert-to", "pdf", "--outdir", outDir, inPath]);

    const pdfPath = path.join(outDir, "guide.pdf");
    const pdf = await fs.readFile(pdfPath);
    return pdf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

