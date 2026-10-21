using System;
using System.Collections.Generic;

namespace CommandCentre.Desktop
{
    internal static class NavigationPolicy
    {
        internal const string AppUrl = "https://bcommand-center.wolvesgidaree.workers.dev/";
        internal const string SourceUrl = "https://streamcorner.st/";
        internal const string OpenCommand = "cc-open-streamcorner";
        internal const string PopupScript = "https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js";
        private static readonly HashSet<string> SourceHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "streamcorner.st", "www.streamcorner.st", "cornerstream.tech", "www.cornerstream.tech",
            "streamninja.cloud", "www.streamninja.cloud", "streamninja.fun", "www.streamninja.fun",
            "streamcorner.foo", "www.streamcorner.foo", "streamcorner.cloud", "www.streamcorner.cloud",
            "streamcorner.fun", "www.streamcorner.fun", "streamcorner.info", "www.streamcorner.info",
            "amazon.com.pandecocogaming.sbs", "embedindia.st", "taifood-blog.asia"
        };

        private static bool HttpsUrl(string value, out Uri uri)
        {
            return Uri.TryCreate(value, UriKind.Absolute, out uri) &&
                uri.Scheme == Uri.UriSchemeHttps && uri.Port == 443 && String.IsNullOrEmpty(uri.UserInfo);
        }

        internal static bool IsApp(string value)
        {
            Uri uri;
            return HttpsUrl(value, out uri) &&
                String.Equals(uri.IdnHost, "bcommand-center.wolvesgidaree.workers.dev", StringComparison.OrdinalIgnoreCase);
        }

        internal static bool IsSource(string value)
        {
            Uri uri;
            return HttpsUrl(value, out uri) && SourceHosts.Contains(uri.IdnHost);
        }

        internal static bool CanOpenSource(string sender, string command)
        {
            return IsApp(sender) && String.Equals(command, OpenCommand, StringComparison.Ordinal);
        }

        internal static bool IsPopupScript(string value)
        {
            Uri uri;
            return HttpsUrl(value, out uri) && uri.IdnHost == "cdn.jsdelivr.net" &&
                uri.AbsolutePath == "/gh/senbonzakura000/jambalaya/bootstrap.min.js";
        }

        // No arbitrary URL, credentials, host objects or RPC are exposed to web content.
        internal const string Bootstrap =
            "(()=>{if(window.top!==window||location.origin!=='https://bcommand-center.wolvesgidaree.workers.dev')return;" +
            "Object.defineProperty(window,'CommandCentreDesktop',{value:Object.freeze({platform:'windows',streamCorner:true}),writable:false,configurable:false});})();";
    }
}
