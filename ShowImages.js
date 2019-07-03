/**
 * @Author Faris Hijazi - https://www.github.com/farishijazi
 * https://github.com/FarisHijazi/ShowImages.js/projects/1
 */

/**
 * @typedef {(Element)} ImgEl
 * @property {number} handlerIndex
 * @property {HTMLImageElement} loaderImage
 * @property {HTMLAnchorElement} anchor
 * @property {string} oldSrc
 * @property {Function} onloadHandler
 * @property {Function} onerrorHandler
 * @property {bool} isReady
 */

/**
 * @typedef {Function} ErrorHandler
 * @returns {Promise}
 */


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
        root.ShowImages = factory();
    }
}(this, function () {
    'use strict';

    var debug = false;

    // Options
    const options = {
        loopReplacedVids: true,
        autoplayReplacedVids: false,
        isShouldTryProxy: true
    };

    /** returns full path, not just partial path */
    var normalizeUrl = (function () {
        var fakeLink = document.createElement('a');

        return function (url) {
            fakeLink.href = url;
            return fakeLink.href;
        }
    })();


    const PProxy = (function () {

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
            /** @deprecated */
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
            static BASE_URL = 'https://d3du9nefdtilsa.cloudfront.net/unsafe/fit-in/x/smart/filters%3Ano_upscale()/';
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
            if (url) return PProxy.proxies.map(proxy => proxy.proxy(url));
        };
        PProxy.proxyAll = function (url) {
            var o = {};
            if (url) o.proxies.forEach(proxy => o[proxy.name] = proxy.proxy(url));
            return o;
        };

        for (const p of PProxy.proxies) {
            PProxy[p.name] = p;
        }

        return PProxy;
    })();

    /** * @type {number} TIMEOUT - trigger the `onerror` if the image takes too long to load */
    let TIMEOUT = 6000;


    //TODO: add option for parallel or serial loading
    /**
     * wait for element to load
     * the loading will happen by using one or more other "fake" loader `Image` objects, and img will only be updated if any loader image loads successfully
     * @author Faris Hijazi, inspired by: gilly3 - https://stackoverflow.com/a/33019709/7771202
     *
     * @param {HTMLImageElement|Node|imgEl} img - the image you want to load
     * @param {(string|string[])=} srcs - img.src is used by default. srcs is the new url(s) to load for the img,
     *          each src in srcs will be loaded in parallel and the first one to load will return.
     *
     * @returns {Promise<Event>}
     *          event will always contain event.img
     *          (although an event may not be passed, an object containing {img: img} will be passed)
     *
     * @param {Object=} opts
     * @param {number=-1} opts.timeout - timeout in milliseconds. if timeout<=0: there will be no timeout
     * @param {boolean=true} opts.setSrc - set the image src attribute up on success?
     */
    function loadPromise(img, srcs = [], opts = {timeout: -1, setSrc: true}) {
        srcs = (typeof srcs === 'string' ? [srcs] :
                (typeof srcs[Symbol.iterator] === 'function' && srcs.length ? srcs : [img.src])
        ).filter(x => !!x);

        // check if already succeeded or already failed
        if (srcs.length === 0 && img.src && img.complete) {
            console.debug('already loaded (initial check)');
            return (img.naturalWidth > 0) ?
                Promise.resolve({img: img}) :
                Promise.reject({img: img, type: 'error', reason: 'noload'});
        }

        img.__loaderImages = [];

        /**
         *
         * @param {HTMLImageElement} img
         * @param {string=} src
         * @returns {Promise<Event>} Event will contain event.src and event.img
         */
        var createLoaderPromise = function (img, src) {
            if (!src && img.src && img.complete) {
                console.debug('already loaded');
                return (img.naturalWidth > 0) ?
                    Promise.resolve({img: img}) :
                    Promise.reject({img: img, type: 'error', reason: 'noload'});
            }

            var loaderImage = new Image();

            img.__loaderImages.push(loaderImage);

            const promise = new Promise(function (resolve, reject) {
                if (opts.timeout > 0) setTimeout(function () {
                    reject({img: img, type: 'error', reason: 'timeout'});
                }, opts.timeout);
                // binding listeners
                loaderImage.onload = function (e) {
                    // console.log(
                    //     'loaded image!' +
                    //     '\nthis=', this,
                    //     '\nevent=', e
                    // );
                    e.src = src; // passing the srcs here to be used later

                    // EXP: saving useless references
                    e.img = img;
                    e.promise = promise;
                    img.__loaderImage = loaderImage;

                    resolve(e);
                };
                loaderImage.onerror = function (e) {
                    // console.error('loadPromise():   image failed loading "' + loaderImage.src + '"');
                    reject(e);
                };
                loaderImage.src = src;
            });

            // defining function cancel() (would be nice if we could just reject/cancel the promise... EC7?! WHEN?!)
            // P.S. found a library (bluebird) that has cancellable promises
            // HACK:
            promise.cancel = promise.cancel || function () {
                loaderImage.onerror = null;
                loaderImage.onload = null;
                loaderImage.remove();
                loaderImage = null;
            };
            return promise;
        };

        if (!srcs.length) {
            console.error('loadPromise(): no srcs was passed');
            return Promise.reject({img: img, reason: 'no-srcs'});
        }

        // image didn't already load if we reached this point it
        const promises = srcs.map((src) => createLoaderPromise(img, src));

        return Promise.race(promises).then(function (e) {
            e.img = e.img || img;

            if (opts.setSrc) {
                e.img.src = e.src;
                img.removeAttribute('srcset');
            }
            promises.forEach(function (promise) {
                if (promise !== e.promise)
                    return promise.cancel();
            });// cancel all other promises (to save resources)
            return e;
        });
    }

    class ImageManager {
        loadTimeout = 15000;
        loadMode = 'serial'; // 'serial' or 'parallel', can also use 's' or 'p'
        images = new Set();
        failedSrcs = new Set();
        successfulUrls = new Set();
        parent = {};
        errorHandlers = [];
        onSuccess = function () {
        };

        /**
         * @param {Object=} opts
         * @param {ShowImages=} opts.parent - usually the ShowImage instance
         * @param {number=15000} opts.loadTimeout - timeout in ms for waiting for images to load
         * @param {string='serial'|'parallel'} opts.loadMode - 'serial' or 'parallel', can also use 's' or 'p'
         * @param {Function=} opts.onSuccess
         * @param {Function[]=} opts.errorHandlers - will be passed the img element
         */
        constructor(opts) {
            var self = this;

            opts = extend({
                parent: null,
                onSuccess: function (img) {
                    self.successfulUrls.add(img.src);
                    if (img.anchor && /\.(gif)($|\?)/i.test(img.anchor.href) || img.oldSrc && /\.(gif)($|\?)/i.test(img.oldSrc)) {
                        debug && console.log('that\'s a gif!:', {
                            'img.anchor': img.anchor,
                            'img.src': img.src,
                            'img.oldSrc': img.oldSrc
                        });
                    }

                    var proxyKey = img.getAttribute('proxy');
                    if (proxyKey && PProxy[proxyKey]) {
                        setBorderWithColor(img, PProxy[proxyKey].color);
                    } else {
                        // language=CSS
                        setBorderWithColor(img, '#04b300');
                    }

                    img.classList.add(self.parent.ClassNames.DISPLAY_ORIGINAL);
                },
                errorHandlers: [],
                laodTimeout: 15000,
                loadMode: 'p',
            }, opts);

            extend(self, opts);
            self.loadMode = (self.loadMode || 'p')[0].toLowerCase();
        }


        /**
         * adds an attribute "load" indicating the load status
         *  load = true:     image loaded successfully
         *  load = loading:    image still loading
         *  load = "error":  image failed to load
         * @param {(ImgEl|Element|HTMLImageElement)} imgEl
         * @param newSrc - the new url to be used
         * @returns {Promise<({img: imgEl})>}
         */
        initImageLoading(imgEl, newSrc) {
            var _im = this;
            if (!imgEl) throw 'imgEl is null!';
            if (imgEl.__isEnhanced || imgEl.getAttribute('loaded') === 'loading' || imgEl.handlerIndex > 0) {
                // console.warn('initImageLoading(imgEl) has been called TWICE!!, MUST FIX', imgEl);
                return Promise.reject({img: imgEl, type: 'return', reason: 'recall'});
            }

            ImageManager.enhanceImg(imgEl, newSrc);

            /**
             * @param imgEl
             * @returns {Promise<Event>}
             *      Event.img must exist
             */
            function tryNextHandler(imgEl) {
                // covers 3 cases: imgEl, loaderImage, event
                var _imgEl = imgEl.img || imgEl;

                debug && console.warn(
                    'tryNextHandler()[' + _imgEl.handlerIndex + ']' +
                    '\nImage:', _imgEl.src
                );

                const currentHandler = _im.errorHandlers[_imgEl.handlerIndex];

                if (!currentHandler || _imgEl.handlerIndex >= _im.errorHandlers.length) {
                    return Promise.reject({img: _imgEl, type: 'return', reason: 'handler out of range'});
                }

                _imgEl.handlerIndex += 1;
                return currentHandler
                    .call(_imgEl, event, _im)
                    .catch((e) => {
                        if (e.type !== 'error') {
                            console.log('currentHandler.catch() NOT AN ERROR!');
                            return e;
                        }

                        return tryNextHandler(_imgEl);
                    });
            }

            /**
             * @this imgEl
             * @param event
             */
            imgEl.onerrorHandler = function (event) {
                const img = this.img || this;
                _im.failedSrcs.add(img.src);

                debug && console.warn('onerrorHandler():', img.src, img, event);
                try {
                    tryNextHandler(img).then((e) => imgEl.onloadHandler.call(img, e));
                } catch (e) {
                    console.error('onerrorHandler() try{}catch{}, caught:\n', e);
                }
                img.setAttribute('handler-index', img.handlerIndex.toString());
            };

            /**
             * @this imgEl
             * @param event
             */
            imgEl.onloadHandler = function (event) {
                const img = this.img || this;
                debug && console.log('image loaded :)', img.src, event);
                if (img.isReady) {
                    img.setAttribute('loaded', 'true');
                    img.style.display = 'block';
                    _im.onSuccess(img);
                } else { // if it didn't load or width==0:
                    imgEl.onerrorHandler.call(imgEl, event);
                }
            };

            // setup the image object
            imgEl.__loaderImage = {};
            _im.images.add(imgEl);


            imgEl.setAttribute('loaded', 'loading');


            // init loading
            var srcs = _im.loadMode === 's' ? [] : PProxy.proxyList(imgEl.src);
            return loadPromise(imgEl, srcs, {setSrc: true, timeout: _im.loadTimeout, mode: _im.loadMode})
                .then((e) => {
                    //TODO: maybe this should return something more meaningful, and the 'event' should be returned too
                    const call = imgEl.onloadHandler.call(imgEl, e);
                    debug && console.log('onloadHandler.call', '\nimgEl:', imgEl, '\ne:', e, '\nreturn:', call);
                    return call;
                })
                .catch((e) => {
                    if (e.type !== 'error') {
                        debug && console.log('promise.catch() NOT AN ERROR!');
                        return e;
                    }

                    return imgEl.onerrorHandler.call(imgEl, e);
                });
        }

        /**
         * turns an image/img to an imgEl type
         * Prepares the image and initializes the extra fields
         *
         * - Add getters and setters for "oldSrc"
         * - set handlerIndex = 0
         * - img.anchor
         *
         * @param {HTMLImageElement|ImgEl} imgEl
         * @param {string=} newSrc - optional target src to set for the image
         *  (oldSrc will be the current src, and this will be the new)
         */
        static enhanceImg(imgEl, newSrc = '') {
            // So here's how it works:
            // 1- image object loads and calls onload
            // 2- it references imgEl and now we start working on imgEl
            // 3- for each onerror, there's an error handler, imgEl.handlerIndex indicates which handler is next
            // 4- until we get to the last handler, and that'd be to mark the image as [loaded="error"]

            imgEl.__defineGetter__('oldSrc', () => this._oldSrc);
            imgEl.__defineSetter__('oldSrc', function (value) {
                this._oldSrc = value;
                if (/^data:/.test(value)) value = value.slice(0, 10);
                this.setAttribute('oldSrc', value);
            });

            imgEl.handlerIndex = 0;
            imgEl.anchor = imgEl.anchor || imgEl.closest('a') || {};
            imgEl.oldSrc = !/^data:/.test(imgEl.src) ? imgEl.src : (imgEl.anchor.href && !/^data:/.test(imgEl.anchor.href) ? imgEl.anchor.href : imgEl.src);
            if (newSrc) {
                imgEl.src = newSrc;
                // imgEl.anchor.href = newSrc; //EXPERIMENTAL:
            }
            imgEl.__isEnhanced = true;

            imgEl.__defineGetter__('isReady', () => imgEl.complete && imgEl.naturalWidth > 1 && imgEl.naturalHeight > 1);
        }
    }


    /**
     * replace thumbnails with source
     *
     * @param {Object} options
     * @param {ImageManager=} options.imageManager
     * @returns {ShowImages}
     */
    class ShowImages {
        imageManager = ImageManager.prototype;
        /**
         * @param {(HTMLImageElement|ImgEl)} img
         * @param {(HTMLAnchorElement|null)} anchor
         * @private
         */
        _imagesFilter = function (img, anchor) {
        };
        ClassNames = {
            DISPLAY_ORIGINAL: 'SI_' + 'tb',
            FAILED: 'SI_' + 'failed',
            FAILED_PROXY: 'SI_' + 'failed-proxy',
        };

        /**
         * @param {Object} options
         * @param {Function(img)=} options.imagesFilter
         */
        constructor(options = {}) {
            var self = this;
            // TODO: define the options and the default values
            options = extend({
                imagesFilter: (img, anchor) => [
                    // !img.classList.contains(self.ClassNames.DISPLAY_ORIGINAL),
                    // !img.closest('.' + this.ClassNames.DISPLAY_ORIGINAL),
                    // /\.(jpg|jpeg|tiff|png|gif)($|[?&])/i.test(anchor.href),
                    !/^data:/.test(anchor.href),
                ].reduce((a, b) => a && b)
                ,
            }, options);
            extend(self, options);

            this._imagesFilter = options.imagesFilter;


            //TODO: allow for just passing fallback URLs as url handlers, and then they'll turn into `loadPromise(img, fallbackUrl)` functions
            /**
             * note: onError handlers must all returns a Promise of the image loading
             * @this imgEl
             * @type {ErrorHandler[]}
             */
            const defaultErrorHandlers = (function getDefaultHandlers() {
                function handler1(event = {}) {
                    const img = this;
                    event.img = img;
                    return __useProxy(img, PProxy.DDG);
                }
                function handler2(event = {}) {
                    const img = this;
                    event.img = img;
                    return __useProxy(img, PProxy.SteemitImages);
                }
                function handler3(event = {}) {
                    const img = this;
                    event.img = img;
                    return __useProxy(img, PProxy.Pocket);
                }
                function handleProxyError(event = {}) {
                    const img = this;
                    if (img.oldSrc) img.src = img.oldSrc; // go back to old src
                    markNotFound(img);
                    img.classList.add(self.ClassNames.FAILED_PROXY);

                    event.img = img;
                    return Promise.reject(event);
                }

                function __useProxy(img, proxy) {
                    if (img.oldSrc) img.src = img.oldSrc; // go back to old src
                    const anchor = img.anchor ? img.anchor : img.closest('a');
                    const href = anchor ? anchor.href : img.src;
                    const proxyUrl = proxy.proxy(href);

                    debug && console.log('useProxy(', href, ')=', proxyUrl);

                    img.classList.remove(self.ClassNames.FAILED, self.ClassNames.FAILED_PROXY);


                    return loadPromise(img, proxyUrl)
                    // return self.replaceImgSrc(img, proxyUrl)
                        .then(e => {
                            img.src = proxyUrl;
                            anchor.href = img.src;
                            setBorderWithColor(img, proxy.color);
                            img.setAttribute('proxy', proxy.name);
                        });
                }

                /**
                 * puts red borders around the mainImage.
                 * @param node
                 */
                function markNotFound(node) {
                    node.classList.add(self.ClassNames.FAILED);
                    node.setAttribute('loaded', 'error');
                    // language=CSS
                    setBorderWithColor(node, '#b90004');
                    self.imageManager.successfulUrls.delete(node.src);
                }

                return [handler1, handler2, handleProxyError];
            })();

            const imOpts = extend({
                parent: self,
                errorHandlers: defaultErrorHandlers,
            }, options);

            // convert urls passed to the errorHandlers to generic fallbackUrl handlers
            imOpts.errorHandlers = imOpts.errorHandlers.map(h => typeof (h) !== 'string' ? h : function createFallbackUrlHandler(e = {}) {
                var fallbackUrl = h;
                var img = this;

                if (img.oldSrc) img.src = img.oldSrc; // go back to old src
                const anchor = img.anchor ? img.anchor : img.closest('a');

                img.classList.remove(self.ClassNames.FAILED, self.ClassNames.FAILED_PROXY);

                return loadPromise(img, fallbackUrl)
                    .then(e => {
                        img.src = fallbackUrl;
                        anchor.href = img.src;
                    });
            });

            self.imageManager = new ImageManager(imOpts);
        }

        /**
         * searches for child thumbnails and replaces the ones found (calls `replaceImgSrc`)
         * replaces the src, `ImageManager.addHandlers(img, img.src);`
         *
         * @param {HTMLElement} node could be an image or any node containing an image
         */
        displayOriginalImage(node) {
            var self = this;

            var thumbnails = Array.from(node.querySelectorAll('a[href] img'));
            var promises = thumbnails.map(
                img => self.replaceImgSrc(img) // either image or vid (whatever works first)
                .then((e) => {
                    debug && console.log('promise callback!! (that was a vid or an img)', '\nimg:', img, '\nevent:', e);
                })
            );

            if (node.matches('a[href] img[src]')) {
                /** @type {ImgEl} */
                const img = node;
                var promise = self.replaceImgSrc(img).then((e) => {
                    debug && console.log('replaceImgSrc promise callback!!', '\nimg:', img, '\nevent:', e);
                });
                promises.shift(promise);
            }

            return promises;
        }
        /**
         * This is the main method that takes an image and replaces its src with its anchors href
         * ShowImages.filter is applied here, only images that pass the filter will have `src` replaced
         * @param {(ImgEl|HTMLImageElement)} img
         * @param {(Element|HTMLAnchorElement|string|boolean|null)=null} anchor -
         *          if the anchor is null (default): the closest parent anchor is used
         *          if the anchor is a string: it's assumed to be the newSrc
         *          if the anchor===false or no anchor is available: the image will be dealt with without an anchor,
         *              set anchor=false to forcefully prevent the use of the parent anchors (rarely used)
         * @returns {Promise<Event>}
         *      @ property event.img
         */
        replaceImgSrc(img, anchor = null) {
            if (!img) return Promise.reject(new Error('image is null'));

            var newSrc;

            if (typeof anchor === 'string') {
                newSrc = String(anchor);
                anchor = null;
            }
            if (!((anchor instanceof Element) || anchor === false))
                anchor = img.closest('a');

            // image has already been replaced
            // if (img.getAttribute('loaded') === 'true') return false;

            //TODO: add support for srcset
            newSrc = newSrc ||
                img.getAttribute('fullres-src') ||
                (anchor && !/^data:/.test(anchor.href) ? anchor.href : img.src);

            //TODO: the following line was here but was removed because it was causing issues, find another palce to put it
            // this.imageManager.failedSrcs.has(newSrc)
            
            if (!this._imagesFilter(img, anchor || {})) {
                return Promise
                    .reject({img: img, type: 'filter-error'})
                    .catch(function (e) {
                        debug && console.warn('Caught (in promise):', e);
                        return e;
                    });
            }
            
            // support for video thumbnails
            // TODO: move this to loadPromise() and make it a more general function that loads all types of media
            if (/\.(mov|mp4|avi|webm|flv|wmv)($|\?)/i.test(anchor.href)) { // if the link is to a video
                debug && console.log('Replacing video thumbnail with original video:', anchor.href, img);
                const videoOptions = 'controls ' + (options.autoplayReplacedVids ? 'autoplay ' : '') + (options.loopReplacedVids ? 'loop ' : '');
                const video = createElement(`<video ${videoOptions} name="media" src="${anchor.href}"  type="video/webm" style="width:${img.clientWidth * 2}px;">`);
                return new Promise((resolve, reject) => {
                    video.addEventListener('loadeddata', resolve, false);
                    video.onerror = reject;
                }).then((r) => {
                    debug && console.log('replaced vid thumbnail successfully:', video, r);
                    anchor.after(video);
                    anchor.remove();
                }).catch(e => {
                    console.warn('failed to replace thumbnail with vid:', img, e);
                    video.remove();
                });
            }

            debug && console.debug('replaceImgSrc()', img);

            img.classList.add(this.ClassNames.DISPLAY_ORIGINAL);

            return this.imageManager.initImageLoading(img, newSrc)
                .catch(function (e) {
                    // debug && console.warn('Caught (in promise):', e)
                    return e;
                })
                ;
        }

        /**
         * general method, binds a mutationObserver and it will display original images
         */
        displayImages(images = [], filter = (img) => true) {
            if (!images || !images.length) {
                images = document.images;
            }
            observeDocument(this.displayOriginalImage.bind(this), images, filter);
            [].map.call(document.querySelectorAll('iframe'), iframe => iframe.querySelectorAll('a[href] img[src]')
                .forEach(this.replaceImgSrc.bind(this)));
        }
    }


    // helper functions

    /*
     *TODO: make a good observer function that takes in:
     * @param {({})} observeOptions
     * @param {Element|Node} baseNode
     * @param {Function(mutation, me) } callback
     * @param {Function} filter - function(mutation): boolean
     */
    function observeDocument(callback, observedNodes = [document.documentElement], filter = (mutation) => true) {
        const mutationObserver = new MutationObserver(function (mutations) {
            mutations.forEach(mutation => {
                if (filter(mutation.target)) {
                    callback(mutation.target, mutationObserver);
                } else {
                    console.log('ignoring mutation:', mutation);
                }
            });
        });

        for (const observedNode of observedNodes) {
            callback(observedNode);
            mutationObserver.observe(observedNode, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: false,
                // attributeOldValue: true,
                attributeFilter: ['src', 'href', 'srcset', 'data-src', 'datasrc']
            });
        }
        return mutationObserver;
    }

    function setBorderWithColor(el, color = '{color: #5d00b3;}') {
        color = color.replace('{color: ', '').replace(';}', '');
        // language=CSS
        return setBorder(el, '{border-radius: 2px; border: 3px ' + color + 'aa' + ' solid}');
    }
    /**
     * Sets the CSS border property of an image or it's container if it exists
     * @param el
     * @param borderArgs
     * @return {boolean}
     */
    function setBorder(el, borderArgs) {
        if (!el.classList.contains('irc_mi')) {// Condition to improve performance only for Google.com
            var container = el.closest('div');

            if (container && !container.classList.contains('irc_mimg') && !container.classList.contains('irc_mutc')) { // @Google-Specific
                setStyleInHTML(container, borderArgs);
                // setStyleInHTML(el, "border", "none !important");
            } else {
                setStyleInHTML(el, borderArgs);
            }
        }
    }
    /**
     * This will set the style of an element by force, by manipulating the style HTML attribute.
     * This gives you more control, you can set the exact text you want in the HTML element (like giving a style priority via "!important").
     * Example calls:
     *  setStyleByHTML(el, "background-image", "url(http://www.example.com/cool.png)")
     *  setStyleByHTML(el, "{ background-image : url(http://www.example.com/cool.png) }")
     * @param {HTMLElement} el
     * @param {String} styleProperty
     * @param {String} [styleValue='']
     * @return {HTMLElement} el
     */
    function setStyleInHTML(el, styleProperty, styleValue = '') {
        styleProperty = styleProperty.trim().replace(/^.*{|}.*$/g, '');

        const split = styleProperty.split(':');
        if (!styleValue && split.length > 1) {
            styleValue = split.pop();
            styleProperty = split.pop();
        }

        if (el.hasAttribute('style')) {
            const styleText = el.getAttribute('style');
            const styleArgument = `${styleProperty}: ${styleValue};`;

            let newStyle = new RegExp(styleProperty, 'i').test(styleText) ?
                styleText.replace(new RegExp(`${styleProperty}:.+?;`, 'im'), styleArgument) :
                `${styleText} ${styleArgument}`;

            el.setAttribute('style', newStyle);
        }
        return el;
    }


    // Copy all attributes from source object to destination object.
    // destination object is mutated.
    function extend(destination, source, recursive) {
        destination = destination || {};
        source = source || {};
        recursive = recursive || false;

        for (var attrName in source) {
            if (source.hasOwnProperty(attrName)) {
                var destVal = destination[attrName];
                var sourceVal = source[attrName];
                if (recursive && isObject(destVal) && isObject(sourceVal)) {
                    destination[attrName] = extend(destVal, sourceVal, recursive);
                } else {
                    destination[attrName] = sourceVal;
                }
            }
        }
        return destination;
    }


    return ShowImages;
}));
