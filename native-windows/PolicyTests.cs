using System;

namespace CommandCentre.Desktop
{
    internal static class PolicyTests
    {
        private static int Main()
        {
            string[] rejectedApp = { "http://bcommand-center.wolvesgidaree.workers.dev/", "https://bcommand-center.wolvesgidaree.workers.dev.evil.test/", "https://bcommand-center.wolvesgidaree.workers.dev:444/", "https://user@bcommand-center.wolvesgidaree.workers.dev/", "file:///C:/test", "javascript:alert(1)", "https://streamcorner.st/", null };
            foreach (string url in rejectedApp) if (NavigationPolicy.IsApp(url)) throw new Exception("Untrusted dashboard origin accepted: " + url);
            if (!NavigationPolicy.IsApp(NavigationPolicy.AppUrl + "?release=10.41.0")) throw new Exception("App route rejected");
            string[] rejectedSource = { "http://streamcorner.st/", "https://streamcorner.st.evil.test/", "https://evil.test/?next=https://streamcorner.st/", "https://streamcorner.st:444/", "https://user@streamcorner.st/", "https://google.com/", "file:///C:/test", "javascript:alert(1)", "ms-settings:privacy", null };
            foreach (string url in rejectedSource) if (NavigationPolicy.IsSource(url)) throw new Exception("Untrusted provider navigation accepted: " + url);
            foreach (string url in new[] { NavigationPolicy.SourceUrl, "https://www.streamcorner.st/stream/123", "https://embedindia.st/embed/nfl-network?player=bitmovin", "https://amazon.com.pandecocogaming.sbs/", "https://taifood-blog.asia/embed/test" }) if (!NavigationPolicy.IsSource(url)) throw new Exception("Known source rejected: " + url);
            if (!NavigationPolicy.CanOpenSource(NavigationPolicy.AppUrl, NavigationPolicy.OpenCommand)) throw new Exception("Trusted bridge rejected");
            if (NavigationPolicy.CanOpenSource(NavigationPolicy.SourceUrl, NavigationPolicy.OpenCommand) || NavigationPolicy.CanOpenSource(NavigationPolicy.AppUrl, "https://evil.test/") || NavigationPolicy.CanOpenSource(NavigationPolicy.AppUrl, null)) throw new Exception("Bridge accepts untrusted sender or arbitrary command");
            if (!NavigationPolicy.IsPopupScript(NavigationPolicy.PopupScript + "?v=1")) throw new Exception("Known popup script not matched");
            foreach (string url in new[] { "https://cdn.jsdelivr.net.evil.test/gh/senbonzakura000/jambalaya/bootstrap.min.js", "https://cdn.jsdelivr.net/npm/disable-devtool@latest", "https://streamcorner.st/assets/CVzAD_BR.js", "https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js-other" }) if (NavigationPolicy.IsPopupScript(url)) throw new Exception("Non-advertising script matched");
            Console.WriteLine("Passed native origin, source navigation and fixed-command bridge checks.");
            return 0;
        }
    }
}
