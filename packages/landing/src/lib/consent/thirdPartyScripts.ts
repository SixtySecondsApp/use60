let loaded = false;

function injectScript(src: string, async = true): void {
  const script = document.createElement('script');
  script.src = src;
  script.async = async;
  document.head.appendChild(script);
}

function injectInlineScript(code: string): void {
  const script = document.createElement('script');
  script.textContent = code;
  document.head.appendChild(script);
}

function loadGA4(): void {
  injectScript('https://www.googletagmanager.com/gtag/js?id=G-HYYZZLNR94');
  injectInlineScript(`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-HYYZZLNR94');
  `);
}

function loadMetaPixel(): void {
  injectInlineScript(`
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '25540553995612206');
    fbq('track', 'PageView');
  `);

  // noscript pixel fallback
  const noscript = document.createElement('noscript');
  const img = document.createElement('img');
  img.height = 1;
  img.width = 1;
  img.style.display = 'none';
  img.src = 'https://www.facebook.com/tr?id=25540553995612206&ev=PageView&noscript=1';
  noscript.appendChild(img);
  document.body.appendChild(noscript);
}

function loadEncharge(): void {
  injectInlineScript(`
    !function(){
      if(!window.EncTracking||!window.EncTracking.started){
        window.EncTracking=Object.assign({}, window.EncTracking, {
          queue:window.EncTracking&&window.EncTracking.queue?window.EncTracking.queue:[],
          track:function(t){this.queue.push({type:"track",props:t})},
          identify:function(t){this.queue.push({type:"identify",props:t})},
          started:!0
        });
        var t=window.EncTracking;
        t.writeKey="UY95xBh931HqCJ5xhx6YsBbM4";
        t.hasOptedIn=true;
        t.shouldGetConsent=false;
        t.optIn=function(){t.hasOptedIn=!0,t&&t.init&&t.init()};
        t.optOut=function(){t.hasOptedIn=!1,t&&t.setOptOut&&t.setOptOut(!0)};
        var n=function(t){
          var n=document.createElement("script");
          n.type="text/javascript";
          n.async=void 0===t||t;
          n.src="https://resources-app.encharge.io/encharge-tracking.min.js";
          var e=document.getElementsByTagName("script")[0];
          e.parentNode.insertBefore(n,e)
        };
        "complete"===document.readyState?n():window.addEventListener("load",n,!1)
      }
    }();
  `);
}

export function loadThirdPartyScripts(): void {
  if (loaded) return;
  loaded = true;

  loadGA4();
  loadMetaPixel();
  loadEncharge();
}
