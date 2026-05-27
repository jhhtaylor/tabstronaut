import * as path from 'path';
import * as fs from 'fs';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // @vscode/test-electron passes --no-sandbox and --disable-gpu-sandbox which
    // cause the VS Code binary to exit with code 9 on macOS when spawned via
    // cp.spawn (without a TTY). The `code` CLI shell script inside the app
    // bundle handles argument passing correctly and avoids this issue.
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.118.1');
    const executablePath = process.platform === 'darwin'
      ? path.resolve(
          path.dirname(vscodeExecutablePath),
          '../Resources/app/bin/code'
        )
      : vscodeExecutablePath;

    if (process.platform === 'darwin' && !fs.existsSync(executablePath)) {
      throw new Error(`code CLI not found at ${executablePath}`);
    }

    await runTests({
      vscodeExecutablePath: executablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
