const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'node', 'index.js'); // Assumes script is in packages/middleware/scripts

try {
  let content = fs.readFileSync(indexPath, 'utf8');

  // Generic function to add logging before a line matching a pattern
  const addLogBefore = (targetLinePattern, logMessage) => {
    const regex = new RegExp(`^(\\s*)${targetLinePattern.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}`, 'gm');
    content = content.replace(regex, (match, p1Indentation) => {
      const logLine = `${p1Indentation}console.log('${logMessage}');`;
      return `${logLine}\\n${match}`;
    });
  };

  // Generic function to add logging after a line matching a pattern
  const addLogAfter = (targetLinePattern, logMessage) => {
    const regex = new RegExp(`^(\\s*${targetLinePattern.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')})$`, 'gm');
    content = content.replace(regex, (match, p1OriginalLine) => {
      const indentation = p1OriginalLine.match(/^(\\s*)/)[0];
      const logLine = `${indentation}console.log('${logMessage}');`;
      return `${p1OriginalLine}\\n${logLine}`;
    });
  };

  // Generic function to add logging inside a catch block
  const addLogToCatch = (catchPatternStart, logMessagePrefix) => {
    // More specific pattern to target the catch block's require error
    const regex = new RegExp(
      `(${catchPatternStart.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}\\s*catch\\s*\\(e\\)\\s*{)`,
      'gm',
    );
    content = content.replace(regex, (match, p1CatchBlockStart) => {
      // Extract indentation from the line *before* the catch
      const lines = content.split('\\n');
      let currentLineNum = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(p1CatchBlockStart.trim().split('\\n').pop())) {
          // find the catch line
          currentLineNum = i;
          break;
        }
      }
      const indentation = lines[Math.max(0, currentLineNum)].match(/^(\\s*)/)[0]; // Indentation of the catch line itself
      const logLine = `${indentation}  console.error('${logMessagePrefix}:', e);`;
      return `${p1CatchBlockStart}\\n${logLine}`;
    });
  };

  // Add top-level platform logs
  content = content.replace(
    /case 'linux':/g,
    "case 'linux':\\n    console.log(`[Middleware Loader] Linux: arch=${arch}, __dirname=${__dirname}`);",
  );
  content = content.replace(
    /case 'darwin':/g,
    "case 'darwin':\\n    console.log(`[Middleware Loader] Darwin: arch=${arch}, __dirname=${__dirname}`);",
  );
  content = content.replace(
    /case 'win32':/g,
    "case 'win32':\\n    console.log(`[Middleware Loader] Windows: arch=${arch}, __dirname=${__dirname}`);",
  );

  // --- Linux Specific Logging ---
  const linuxArchCases = ['x64', 'arm64', 'arm', 'riscv64', 's390x'];
  const linuxLibcTypes = ['gnu', 'musl'];

  linuxArchCases.forEach((arch) => {
    linuxLibcTypes.forEach((libc) => {
      if (arch === 'arm' && libc === 'musl') return; // skip arm-musl as it's usually gnueabihf
      if (arch === 's390x' && libc === 'musl') return; // skip s390x-musl

      const moduleNamePart = `linux-${arch}${arch === 'arm' ? '-gnueabihf' : arch === 's390x' ? '-gnu' : `-${libc}`}`;
      const nodeFile = `zubridge-middleware.${moduleNamePart}.node`;
      const packageName = `@zubridge/middleware-${moduleNamePart}`;

      // Log before existsSync
      const existsSyncPattern = `localFileExisted = existsSync\\(join\\(__dirname, '${nodeFile}'\\)\\)`;
      const existsSyncRegex = new RegExp(
        `^(\\s*)${existsSyncPattern.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}`,
        'gm',
      );
      content = content.replace(existsSyncRegex, (match, p1Indentation) => {
        const logLine = `${p1Indentation}console.log(\`[Middleware Loader] Linux ${arch}-${libc}: Checking exists: \${join(__dirname, '${nodeFile}')}\`);`;
        return `${logLine}\\n${match}`;
      });

      // Log after existsSync (value of localFileExisted)
      const afterExistsSyncRegex = new RegExp(
        `(${existsSyncPattern.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')})`,
        'gm',
      );
      content = content.replace(afterExistsSyncRegex, (match) => {
        const logLine = `console.log(\`[Middleware Loader] Linux ${arch}-${libc}: localFileExisted=\${localFileExisted}\`);`;
        // Need to find the indentation of the original line
        const lines = content.split('\\n');
        let originalLineIndentation = '';
        for (const line of lines) {
          if (line.includes(match)) {
            originalLineIndentation = line.match(/^(\\s*)/)[0];
            break;
          }
        }
        return `${match}\\n${originalLineIndentation}${logLine}`;
      });

      // Log before local require
      addLogBefore(
        `nativeBinding = require\\('./${nodeFile}'\\)`,
        `[Middleware Loader] Linux ${arch}-${libc}: Attempting local require: './${nodeFile}'`,
      );
      // Log before package require
      addLogBefore(
        `nativeBinding = require\\('${packageName}'\\)`,
        `[Middleware Loader] Linux ${arch}-${libc}: Attempting package require: '${packageName}'`,
      );

      const tryBlockPatternForCatch = `try {\\s*if \\(localFileExisted\\) \\{[\\s\\S]*?require\\('./${nodeFile}'\\)[\\s\\S]*?\\} else \\{[\\s\\S]*?require\\('${packageName}'\\)[\\s\\S]*?\\}\\s*}`;
      const catchRegex = new RegExp(`(${tryBlockPatternForCatch})\\s*catch\\s*\\(e\\)\\s*{`, 'gm');
      content = content.replace(catchRegex, (match, p1TryBlock) => {
        const lines = content.split('\\n');
        let currentLineNum = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(p1TryBlock.trim().split('\\n')[0])) {
            currentLineNum = i;
            break;
          }
        }
        const indentation = lines[Math.max(0, currentLineNum + p1TryBlock.split('\\n').length - 1)].match(/^(\\s*)/)[0];
        return `${p1TryBlock}\\n${indentation}catch (e) {\\n${indentation}  console.error('[Middleware Loader] Linux ${arch}-${libc}: Error loading binding:', e);`;
      });
    });
  });

  // --- Darwin Specific Logging ---
  const darwinArchCases = ['universal', 'x64', 'arm64'];
  darwinArchCases.forEach((arch) => {
    const nodeFile = `zubridge-middleware.darwin-${arch}.node`;
    const packageName = `@zubridge/middleware-darwin-${arch}`;
    const archDisplay = arch.charAt(0).toUpperCase() + arch.slice(1);

    addLogBefore(
      `nativeBinding = require\\('./${nodeFile}'\\)`,
      `[Middleware Loader] Darwin ${archDisplay}: Attempting local require: './${nodeFile}'`,
    );
    addLogBefore(
      `nativeBinding = require\\('${packageName}'\\)`,
      `[Middleware Loader] Darwin ${archDisplay}: Attempting package require: '${packageName}'`,
    );

    const tryBlockPatternForCatch = `try {\\s*if \\(localFileExisted\\) \\{[\\s\\S]*?require\\('./${nodeFile}'\\)[\\s\\S]*?\\} else \\{[\\s\\S]*?require\\('${packageName}'\\)[\\s\\S]*?\\}\\s*}`;
    const catchRegex = new RegExp(`(${tryBlockPatternForCatch})\\s*catch\\s*\\(e\\)\\s*{`, 'gm');
    content = content.replace(catchRegex, (match, p1TryBlock) => {
      const lines = content.split('\\n');
      let currentLineNum = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(p1TryBlock.trim().split('\\n')[0])) {
          currentLineNum = i;
          break;
        }
      }
      const indentation = lines[Math.max(0, currentLineNum + p1TryBlock.split('\\n').length - 1)].match(/^(\\s*)/)[0];
      return `${p1TryBlock}\\n${indentation}catch (e) {\\n${indentation}  console.error('[Middleware Loader] Darwin ${archDisplay}: Error loading binding:', e);`;
    });
  });

  // --- Windows Specific Logging ---
  const windowsArchCases = ['x64-msvc', 'ia32-msvc', 'arm64-msvc'];
  windowsArchCases.forEach((arch) => {
    const nodeFile = `zubridge-middleware.win32-${arch}.node`;
    const packageName = `@zubridge/middleware-win32-${arch}`;
    const archDisplay = arch.replace('-msvc', '').toUpperCase();

    addLogBefore(
      `nativeBinding = require\\('./${nodeFile}'\\)`,
      `[Middleware Loader] Windows ${archDisplay}: Attempting local require: './${nodeFile}'`,
    );
    addLogBefore(
      `nativeBinding = require\\('${packageName}'\\)`,
      `[Middleware Loader] Windows ${archDisplay}: Attempting package require: '${packageName}'`,
    );

    const tryBlockPatternForCatch = `try {\\s*if \\(localFileExisted\\) \\{[\\s\\S]*?require\\('./${nodeFile}'\\)[\\s\\S]*?\\} else \\{[\\s\\S]*?require\\('${packageName}'\\)[\\s\\S]*?\\}\\s*}`;
    const catchRegex = new RegExp(`(${tryBlockPatternForCatch})\\s*catch\\s*\\(e\\)\\s*{`, 'gm');
    content = content.replace(catchRegex, (match, p1TryBlock) => {
      const lines = content.split('\\n');
      let currentLineNum = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(p1TryBlock.trim().split('\\n')[0])) {
          currentLineNum = i;
          break;
        }
      }
      const indentation = lines[Math.max(0, currentLineNum + p1TryBlock.split('\\n').length - 1)].match(/^(\\s*)/)[0];
      return `${p1TryBlock}\\n${indentation}catch (e) {\\n${indentation}  console.error('[Middleware Loader] Windows ${archDisplay}: Error loading binding:', e);`;
    });
  });

  // Final error logging
  const finalErrorIf = 'if (!nativeBinding) {';
  const finalErrorIfRegex = new RegExp(`^(\\s*)${finalErrorIf.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')}`, 'gm');
  content = content.replace(finalErrorIfRegex, (match, p1Indentation) => {
    const errorBlock = `
${p1Indentation}if (!nativeBinding) {
${p1Indentation}  if (loadError) {
${p1Indentation}    console.error('[Middleware Loader] Final Error: Original loadError:', loadError);
${p1Indentation}    throw loadError;
${p1Indentation}  }
${p1Indentation}  const finalErrorMessage = \`[Middleware Loader] Final Error: Failed to load native binding for OS: \${platform}, arch: \${arch}. No specific error caught during previous attempts.\`;
${p1Indentation}  console.error(finalErrorMessage);
${p1Indentation}  throw new Error(finalErrorMessage);
${p1Indentation}}`;
    return errorBlock;
  });
  // Remove any duplicate if (!nativeBinding) immediately following our block.
  content = content.replace(
    /(if \\(!nativeBinding\\) \\{\\s*if \\(loadError\\) \\{[\\s\\S]*?throw new Error\\(finalErrorMessage\\);\\s*\\})\\s*if \\(!nativeBinding\\) \\{/gm,
    '$1',
  );

  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('Successfully added logging to', indexPath);
} catch (error) {
  console.error('Failed to add logging to NAPI loader script:', error);
  process.exit(1);
}
