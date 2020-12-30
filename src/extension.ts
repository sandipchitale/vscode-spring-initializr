import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-spring-initializr-webview.start', () => {
      SpringInitializrPanel.createOrShow(context.extensionUri);
    })
  );
}

/**
 * Manages Spring Initializr webview panel
 */
class SpringInitializrPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: SpringInitializrPanel | undefined;

  public static readonly viewType = 'spring-initializr';

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

        // And restrict the webview to only loading content from our extension's `media` directory and https://start.spring.io/
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.parse('https://start.spring.io/')
        ]
      }
    );

    SpringInitializrPanel.currentPanel = new SpringInitializrPanel(panel, extensionUri);
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
    const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode-spring-initializr.css');
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
  <iframe id="spring-initializr" src="https://start.spring.io/"></iframe>
</body>
</html>
`;
  }
}
