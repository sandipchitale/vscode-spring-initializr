import * as express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import * as vscode from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as download from 'download';

const port = 7654;

const START_SPRING_IO = 'https://start.spring.io';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-spring-initializr-webview.start', () => {
      SpringInitializrPanel.createOrShow(context.extensionUri);
    })
  );

  const app = express();

  app.use(function (req, res, next) {
    if (req.url.startsWith('/starter.zip')) {
      SpringInitializrPanel.hide();
      setTimeout(async () => {
        const projectName = req.url.replace(/.+&baseDir=/, '').replace(/&.+/, '');
        if (projectName) {

          let defaultFolder = os.tmpdir();
          const config = vscode.workspace.getConfiguration('vscode-spring-initializr-webview');
          if (config) {
            const defaultFolderConfig = config.get<string>('projects-folder');
            if (defaultFolderConfig) {
              defaultFolder = defaultFolderConfig;
            }
          }
          defaultFolder = defaultFolder.trim();
          if (defaultFolder.trim() === '') {
            defaultFolder = os.tmpdir();
          } else if (defaultFolder.startsWith('~')) {
            defaultFolder = defaultFolder.replace(/~/, os.homedir());
          } else if (defaultFolder.startsWith('{TMP}')) {
            defaultFolder = defaultFolder.replace(/{TMP}/, os.tmpdir());
          }

          const extractDirectoryUris: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
            defaultUri: vscode.Uri.file(defaultFolder),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Extract',
            title: `Extract project ${projectName} to Folder`
          });
          if (extractDirectoryUris && extractDirectoryUris.length > 0) {
            if (fs.existsSync(path.join(extractDirectoryUris[0].fsPath, projectName))) {
              vscode.window.showErrorMessage(`Project ${projectName} folder already exists in ${extractDirectoryUris[0].fsPath}`);
              return;
            }
            try {
              await download(`${START_SPRING_IO}${req.url}`, extractDirectoryUris[0].fsPath, {
                extract: true
              });
              vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path.join(extractDirectoryUris[0].fsPath, projectName)), {
                forceNewWindow: true
              });
            } catch (error) {
              //
            }
          }
        }
      }, 0);
      return res.status(204).send();
    }
    next();
});

  app.use('/**',
    createProxyMiddleware({
      target: START_SPRING_IO,
      changeOrigin: true,
      followRedirects: true,
      onProxyRes: (proxyRes, req, res) => {
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['X-Frame-Options'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['Content-Security-Policy'];
      }
    })
  );

  app.listen(port, () => {
    // console.log(`Proxy listening at http://localhost:${port}`);
  });
}

/**
 * Manages Spring Initializr webview panel
 */
class SpringInitializrPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: SpringInitializrPanel | undefined;

  public static readonly viewType = 'spring-initializr-iframe';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    if (SpringInitializrPanel.currentPanel) {
      SpringInitializrPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      SpringInitializrPanel.viewType,
      'Spring Initializr',
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'assets'),
          vscode.Uri.parse(`http://localhost:${port}/`),
          vscode.Uri.parse(START_SPRING_IO)
        ]
      }
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'icon.png');

    SpringInitializrPanel.currentPanel = new SpringInitializrPanel(panel, extensionUri);
  }

  public static hide() {
    if (SpringInitializrPanel.currentPanel) {
      SpringInitializrPanel.currentPanel._panel.dispose();
      SpringInitializrPanel.currentPanel = undefined;
    }
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    SpringInitializrPanel.currentPanel = new SpringInitializrPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public dispose() {
    SpringInitializrPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'assets', 'css', 'vscode-spring-initializr.css');
    // Uri to load styles into webview
    const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${stylesMainUri}" rel="stylesheet">
  <title>Spring Initializr</title>
</head>
<body>
  <iframe id="spring-initializr" src="http://localhost:${port}/"></iframe>
</body>
</html>
`;
  }
}
