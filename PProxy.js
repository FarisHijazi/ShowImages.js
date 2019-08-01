(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.PProxy = factory();
    }
}(this, function () {

    function removeReloadEverywhere() {
        for (const a of document.querySelectorAll('a[href^="https://proxy.duckduckgo.com/iu"]')) {
            a.href = a.href.replace(/&reload=on|%26reload%3Don/g, '');
        }
        for (const x of document.querySelectorAll('[src^="https://proxy.duckduckgo.com/iu"]')) {
            x.src = x.src.replace(/&reload=on|%26reload%3Don/g, '');
        }
    }

    class ProxyInterface {
        constructor() {
            throw Error('Static class cannot be instantiated');
        }
        static get color() {
            return '#00000';
        }
        // only to be used by children
        static get name() {
            return constructor.name;
        }

        static test(url) {
        }
        static proxy(url) {
        }
        static reverse(proxyUrl) {
        }
    }

    /**Returns a DuckDuckGo proxy url (attempts to unblock the url)*/
    class DDG extends ProxyInterface {
        static get color() {
            return '#FFA500';
        }
        static test(url) {
            return /^https:\/\/proxy\.duckduckgo\.com/.test(url);
        }
        static proxy(url) {
            return DDG.test(url) || /^(javascript)/i.test(url) ? url : (`https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(url)}&f=1`);
        }
        static isDdgUrl() {
            new Error('This function "isDdgUrl()" is deprecated, use "PProxy.DDG.test()" instead');
        }
        static reverse(url) {
            // if (isZscalarUrl(url)) s = getOGZscalarUrl(url); // extra functionality:
            if (!DDG.test(url)) {
                return url;
            }
            return new URL(location.href).searchParams.get('u');
        }
    }

    /**Returns a Pocket proxy url*/
    class Pocket extends ProxyInterface {
        static get BASE_URL() {
            return 'https://d3du9nefdtilsa.cloudfront.net/unsafe/fit-in/x/smart/filters%3Ano_upscale()/'
        };
        static get color() {
            return '#e082df';
        }
        static test(url) {
            return /(^https:\/\/pocket-image-cache\.com\/direct\?url=)|(cloudfront\.net\/unsafe\/fit-in\/x\/smart\/filters%3Ano_upscale\(\)\/)/.test(url);
        }
        static proxy(url) {
            return Pocket.test(url) || /^(javascript)/i.test(url) ? url : 'https://pocket-image-cache.com/direct?url=' + url;
        }
        static reverse(url) {
            if (!Pocket.test(url)) {
                return url;
            }

            if (url.indexOf(Pocket.BASE_URL) === 0) {
                return url.substring(Pocket.BASE_URL.length, -1);
            }
            if (url.indexOf('https://pocket-image-cache.com/direct') === 0) {
                return new URL(url).searchParams.get('url');
            }
            return url;
        }
    }

    class FileStack extends ProxyInterface {
        static get color() {
            return '#acb300';
        }
        static test(url) {
            return /https:\/\/process\.filestackapi\.com\/.+\//.test(url);
        }
        static proxy(url) {
            return 'https://process.filestackapi.com/AhTgLagciQByzXpFGRI0Az/' + encodeURIComponent(url.trim());
        }
        static reverse(url) {
        }
    }

    class SteemitImages extends ProxyInterface {
        static get color() {
            return '#0074B3';
        }
        static test(url) {
            return /https:\/\/steemitimages\.com\/(p|0x0)\//.test(url);
        }
        static proxy(url) {
            return /\.(jpg|jpeg|tiff|png|gif)($|[?&])/i.test(url) ? ('https://steemitimages.com/0x0/' + url.trim()) : url;
        }
        static reverse(url) {
            if (!SteemitImages.test(url)) {
                return url;
            }
            console.warn('SteemitImages.reverse() is not fully supported, it\'ll only work sometimes');
            return url.replace('https://steemitimages.com/0x0/', '');
        }
    }

    //

    var PProxy = {};
    PProxy.proxies = [
        FileStack,
        SteemitImages,
        DDG,
        Pocket,
    ];
    PProxy.__defineGetter__('names', () => PProxy.proxies.map(p => p.name));
    /**
     * get a proxified url from each proxy
     * @param url
     * @returns {*}
     */
    PProxy.proxyList = function (url) {
        return PProxy.proxies.map(proxy => proxy.proxy(url));
    };
    PProxy.proxyAll = function (url) {
        var o = {};
        o.proxies.forEach(proxy => o[proxy.name] = proxy.proxy(url));
        return o;
    };

    for (const p of PProxy.proxies) {
        PProxy[p.name] = p;
    }

    return PProxy;
}));

