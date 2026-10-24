using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace CommandCentre.Desktop
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new CommandCentreWindow());
        }
    }

    internal sealed class CommandCentreWindow : Form
    {
        private readonly Panel browserPanel = new Panel();
        private readonly FlowLayoutPanel toolbar = new FlowLayoutPanel();
        private readonly Label status = new Label();
        private readonly Button returnButton = MakeButton("Back to Command Centre");
        private readonly Button sourceBack = MakeButton("Back");
        private readonly Button reload = MakeButton("Reload");
        private readonly Button sourceHome = MakeButton("StreamCorner");
        private readonly WebView2 dashboard = new WebView2();
        private WebView2 source;
        private CoreWebView2Environment sourceEnvironment;
        private bool openingSource;
        private bool closed;
        private bool sourceVisible;
        private string sourceUrl = NavigationPolicy.SourceUrl;
        private string sourceName = "StreamCorner";
        private bool sourceFullscreen;
        private FormBorderStyle previousBorderStyle;
        private FormWindowState previousWindowState;
        private Rectangle previousBounds;
        private bool previousTopMost;

        internal CommandCentreWindow()
        {
            Text = "Command Centre";
            Size = new Size(1360, 900);
            MinimumSize = new Size(900, 640);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(8, 15, 30);
            Font = new Font("Segoe UI", 10);
            KeyPreview = true;

            toolbar.Dock = DockStyle.Top;
            toolbar.Height = 50;
            toolbar.WrapContents = false;
            toolbar.Padding = new Padding(8, 6, 8, 6);
            toolbar.BackColor = Color.FromArgb(16, 26, 44);
            toolbar.Controls.AddRange(new Control[] { returnButton, sourceBack, reload, sourceHome });
            status.Dock = DockStyle.Bottom;
            status.Height = 28;
            status.ForeColor = Color.FromArgb(205, 219, 236);
            status.Padding = new Padding(10, 4, 0, 0);
            status.Text = "Loading Command Centre...";
            browserPanel.Dock = DockStyle.Fill;
            dashboard.Dock = DockStyle.Fill;
            browserPanel.Controls.Add(dashboard);
            Controls.Add(browserPanel);
            Controls.Add(status);
            Controls.Add(toolbar);
            returnButton.Click += delegate { ReturnToDashboard(); };
            sourceBack.Click += delegate { if (source != null && source.CoreWebView2 != null && source.CoreWebView2.CanGoBack) source.CoreWebView2.GoBack(); };
            reload.Click += delegate
            {
                WebView2 active = sourceVisible ? source : dashboard;
                if (active != null && active.CoreWebView2 != null) active.CoreWebView2.Reload();
            };
            sourceHome.Click += async delegate
            {
                if (sourceVisible && source != null && source.CoreWebView2 != null) source.CoreWebView2.Navigate(sourceUrl);
                else await OpenSourceAsync();
            };
            KeyDown += delegate(object sender, KeyEventArgs args)
            {
                if (args.Control && args.KeyCode == Keys.Home && sourceVisible) { ReturnToDashboard(); args.Handled = true; }
            };
            FormClosed += delegate { closed = true; DisposeSource(); dashboard.Dispose(); };
            Shown += async delegate { await InitializeAsync(); };
            UpdateToolbar();
        }

        private static Button MakeButton(string text)
        {
            Button button = new Button();
            button.Text = text;
            button.AutoSize = true;
            button.Height = 34;
            button.Padding = new Padding(8, 0, 8, 0);
            button.Margin = new Padding(0, 0, 8, 0);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Color.FromArgb(68, 88, 116);
            button.BackColor = Color.FromArgb(27, 43, 67);
            button.ForeColor = Color.White;
            button.AccessibleName = text;
            return button;
        }

        private static string Profile(string name)
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CommandCentre", "Browser", name);
        }

        private async Task InitializeAsync()
        {
            try
            {
                CoreWebView2Environment appEnvironment = await CoreWebView2Environment.CreateAsync(null, Profile("Dashboard"), null);
                if (closed) return;
                await dashboard.EnsureCoreWebView2Async(appEnvironment);
                if (closed) return;
                CoreWebView2 core = dashboard.CoreWebView2;
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.IsStatusBarEnabled = false;
                await core.AddScriptToExecuteOnDocumentCreatedAsync(NavigationPolicy.Bootstrap);
                core.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs args)
                {
                    string command;
                    try { command = args.TryGetWebMessageAsString(); } catch { return; }
                    string requestedSource = NavigationPolicy.SourceForCommand(args.Source, command);
                    if (requestedSource != null) await OpenSourceAsync(requestedSource);
                };
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args)
                {
                    if (args.Uri != "about:blank" && !NavigationPolicy.IsApp(args.Uri))
                    {
                        args.Cancel = true;
                        if (NavigationPolicy.IsSource(args.Uri)) { string target = NavigationPolicy.IsTimStreams(args.Uri) ? NavigationPolicy.TimStreamsUrl : NavigationPolicy.SourceUrl; BeginInvoke(new Action(async delegate { await OpenSourceAsync(target); })); }
                        else SetStatus("That external link is outside this app view.");
                    }
                };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args)
                {
                    args.Handled = true;
                    if (!args.IsUserInitiated) return;
                    if (NavigationPolicy.IsApp(args.Uri)) core.Navigate(args.Uri);
                    else if (NavigationPolicy.IsSource(args.Uri)) { string target = NavigationPolicy.IsTimStreams(args.Uri) ? NavigationPolicy.TimStreamsUrl : NavigationPolicy.SourceUrl; BeginInvoke(new Action(async delegate { await OpenSourceAsync(target); })); }
                    else SetStatus("That external link is outside this app view.");
                };
                core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
                {
                    if (!sourceVisible) SetStatus(args.IsSuccess ? "Command Centre" : "Dashboard could not load: " + args.WebErrorStatus + ". Use Reload to retry.");
                };
                core.ProcessFailed += delegate { if (!sourceVisible) SetStatus("The dashboard browser stopped. Use Reload to recover."); };
                core.Navigate(NavigationPolicy.AppUrl);
            }
            catch (Exception error)
            {
                SetStatus("Could not start the app browser.");
                MessageBox.Show(this, "Command Centre needs Microsoft Edge WebView2 Runtime. If it is installed, try reopening the app.\n\n" + error.Message, "Command Centre", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private async Task OpenSourceAsync(string requestedUrl = null)
        {
            if (closed || openingSource) return;
            string targetUrl = requestedUrl ?? NavigationPolicy.SourceUrl;
            if (targetUrl != NavigationPolicy.SourceUrl && targetUrl != NavigationPolicy.TimStreamsUrl && !NavigationPolicy.IsTimStreamsGame(targetUrl)) return;
            if (sourceVisible && source != null) { source.Focus(); return; }
            sourceUrl = targetUrl;
            sourceName = NavigationPolicy.IsTimStreams(targetUrl) ? "TimStreams" : "StreamCorner";
            openingSource = true;
            sourceHome.Enabled = false;
            SetStatus("Opening " + sourceName + "...");
            WebView2 pending = null;
            try
            {
                sourceEnvironment = await CoreWebView2Environment.CreateAsync(null, Profile(sourceName), null);
                if (closed) return;
                pending = new WebView2();
                pending.Dock = DockStyle.Fill;
                pending.KeyDown += delegate(object sender, KeyEventArgs args)
                {
                    if (args.Control && args.KeyCode == Keys.Home)
                    {
                        args.Handled = true;
                        args.SuppressKeyPress = true;
                        BeginInvoke(new Action(ReturnToDashboard));
                    }
                };
                browserPanel.Controls.Add(pending);
                await pending.EnsureCoreWebView2Async(sourceEnvironment);
                if (closed) { pending.Dispose(); return; }
                CoreWebView2 core = pending.CoreWebView2;
                // This separate profile has no dashboard cookies, API keys, bridge or host objects.
                core.Settings.AreHostObjectsAllowed = false;
                core.Settings.IsWebMessageEnabled = false;
                core.Settings.AreDefaultScriptDialogsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.ContainsFullScreenElementChanged += delegate { SetSourceFullscreen(core.ContainsFullScreenElement); };
                // This observed aclib/PopUnder loader repeatedly intercepts source-link clicks.
                // Block that exact advertising script; retain all provider/player scripts and CSP.
                core.AddWebResourceRequestedFilter(NavigationPolicy.PopupScript + "*", CoreWebView2WebResourceContext.Script);
                core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs args)
                {
                    if (NavigationPolicy.IsPopupScript(args.Request.Uri))
                        args.Response = sourceEnvironment.CreateWebResourceResponse(Stream.Null, 403, "Popup script blocked", "Content-Type: text/plain");
                };
                core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args)
                {
                    if (args.Uri != "about:blank" && !NavigationPolicy.IsSource(args.Uri, sourceUrl))
                    {
                        args.Cancel = true;
                        SetStatus(sourceName + " blocked an outside navigation. Your player stays in this window.");
                    }
                };
                core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args)
                {
                    args.Handled = true;
                    if (args.IsUserInitiated && NavigationPolicy.IsSource(args.Uri, sourceUrl)) core.Navigate(args.Uri);
                };
                core.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs args) { args.Cancel = true; SetStatus("Downloads are disabled in the " + sourceName + " view."); };
                core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args)
                {
                    // Keep normal media support, without exposing cameras, microphones or location.
                    string kind = args.PermissionKind.ToString();
                    if (kind == "Microphone" || kind == "Camera" || kind == "Geolocation" || kind == "Notifications" || kind == "ClipboardRead") args.State = CoreWebView2PermissionState.Deny;
                };
                core.HistoryChanged += delegate { UpdateToolbar(); };
                core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
                {
                    if (sourceVisible) SetStatus(args.IsSuccess ? sourceName + " - choose a match and a compatible source. Ctrl+Home returns to Command Centre." : sourceName + " could not load: " + args.WebErrorStatus + ". Use Reload to retry.");
                    UpdateToolbar();
                };
                core.ProcessFailed += delegate { if (sourceVisible) SetStatus("The source browser stopped. Return to Command Centre, then reopen " + sourceName + "."); };
                if (dashboard.CoreWebView2 != null && NavigationPolicy.IsApp(dashboard.CoreWebView2.Source))
                    await dashboard.CoreWebView2.ExecuteScriptAsync("window.CommandCentreStreamCorner?.close();window.closeLiveFootball?.();window.stopVideoPlayback?.();");
                if (closed) { pending.Dispose(); return; }
                source = pending;
                sourceVisible = true;
                dashboard.Visible = false;
                source.BringToFront();
                source.Visible = true;
                Text = sourceName + " - Command Centre";
                UpdateToolbar();
                core.Navigate(sourceUrl);
                source.Focus();
            }
            catch (Exception error)
            {
                if (pending != null) pending.Dispose();
                source = null;
                sourceVisible = false;
                dashboard.Visible = true;
                SetStatus(sourceName + " could not open: " + error.Message);
            }
            finally { openingSource = false; if (!closed) { sourceHome.Enabled = true; UpdateToolbar(); } }
        }

        private void DisposeSource()
        {
            SetSourceFullscreen(false);
            WebView2 previous = source;
            source = null;
            sourceVisible = false;
            if (previous == null) return;
            if (previous.CoreWebView2 != null) previous.CoreWebView2.Stop();
            browserPanel.Controls.Remove(previous);
            previous.Dispose();
            sourceEnvironment = null;
        }

        private void SetSourceFullscreen(bool enabled)
        {
            if (closed || sourceFullscreen == enabled) return;
            sourceFullscreen = enabled;
            SuspendLayout();
            if (enabled)
            {
                previousBorderStyle = FormBorderStyle;
                previousWindowState = WindowState;
                previousBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                previousTopMost = TopMost;
                toolbar.Visible = false;
                status.Visible = false;
                WindowState = FormWindowState.Normal;
                FormBorderStyle = FormBorderStyle.None;
                Bounds = Screen.FromControl(this).Bounds;
                TopMost = true;
            }
            else
            {
                TopMost = previousTopMost;
                WindowState = FormWindowState.Normal;
                FormBorderStyle = previousBorderStyle;
                Bounds = previousBounds;
                WindowState = previousWindowState;
                toolbar.Visible = true;
                status.Visible = true;
            }
            ResumeLayout(true);
        }

        private void ReturnToDashboard()
        {
            DisposeSource();
            dashboard.Visible = true;
            dashboard.BringToFront();
            dashboard.Focus();
            Text = "Command Centre";
            SetStatus("Command Centre");
            UpdateToolbar();
        }

        private void UpdateToolbar()
        {
            returnButton.Visible = sourceVisible;
            sourceBack.Visible = sourceVisible;
            sourceBack.Enabled = source != null && source.CoreWebView2 != null && source.CoreWebView2.CanGoBack;
            sourceHome.Visible = sourceVisible;
            sourceHome.Text = sourceVisible ? sourceName + " home" : "StreamCorner";
            if (sourceVisible) sourceHome.AccessibleDescription = "Return to the source catalogue. This closes the current player.";
        }

        private void SetStatus(string text) { if (!closed) status.Text = text; }
    }
}
