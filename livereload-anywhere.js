document.moduleLiveReload = (function(document) {
	'use strict';

	// list of loaded-redirects, in the object-format { urlContains: 'original.css', rewriteTo: 'http://127.0.0.1:8887/rewritten.css' }
	var loadedRedirects = [];
	
	// if applied, restrict to only these domains
	var urlFilters = [];

	// internal counter, used for cache-busting and internal bookkeeping
	var counter = 0;
	
	// internal timer id
	var intervalId; 

	// interval between checks
	var intervalTiming = 2000;

	var baseRewriteDomain = 'localhost';

    var liveReloadStates = {
        STOPPED: 1,
        RUNNING: 2
    };

	var currentLiveReloadState = liveReloadStates.STOPPED;
	var liveReloadDashboardElement;
	var liveReloadDashboardIndicator;
	var liveReloadIndicatorIntervalId;

	function getRewriteUrl() {
		return 'http://' + baseRewriteDomain;
	}

	function updateDashboardState(newState) {
		if (newState) {
			currentLiveReloadState = newState;
		}

		if (liveReloadDashboardIndicator) {
			liveReloadDashboardIndicator.style['background-color'] = currentLiveReloadState === liveReloadStates.STOPPED ? '#00FF00' : '#FF0000';

			clearInterval(liveReloadIndicatorIntervalId);
			liveReloadDashboardIndicator.style.opacity = "1";
			liveReloadDashboardElement.title = 'stopped';

			if (newState === liveReloadStates.RUNNING) {
				liveReloadDashboardElement.title = 'running';
				liveReloadIndicatorIntervalId = setInterval(function(){
					liveReloadDashboardIndicator.style.opacity = liveReloadDashboardIndicator.style.opacity === "1" ? ".2" : "1";
				}, 500);
			}
		}
	}

	function createIndicatorTemplate() {
		liveReloadDashboardElement = document.createElement('div');
		liveReloadDashboardElement.style.cssText = 'position: absolute;background-color: #000;padding: 2px 5px;font-size: 10px;opacity: .1;color: #fff;z-index:999999999;cursor:pointer;transition: opacity .5s ease-in-out;display:flex;align-items:center;border-bottom-right-radius:15px;';
		liveReloadDashboardElement.innerText = 'LiveReload:';
        liveReloadDashboardElement.onmouseout = function () { this.style.opacity = .1; };
        liveReloadDashboardElement.onmouseover = function () { this.style.opacity = 1; };
		liveReloadDashboardElement.addEventListener('click', function(e) {
			if (currentLiveReloadState === liveReloadStates.STOPPED) {
				setupTimer();
			} else {
				stopTimer();
			}
		});

		liveReloadDashboardIndicator = document.createElement('span');
		liveReloadDashboardIndicator.id = 'livereload-state';
		liveReloadDashboardIndicator.style.cssText = 'border-radius: 5px; width: 5px; height: 5px; display: inline-block;transition: opacity .5s ease-in-out;margin: 0 5px';
		liveReloadDashboardElement.appendChild(liveReloadDashboardIndicator);

		document.body.insertBefore(liveReloadDashboardElement, document.body.firstElementChild);	// prepend is nicer, but has no support in Edge, IE.

		updateDashboardState(undefined);
	}

	// internal logging message
	function logMessage(message) {
		console && console.log('livereload: ' + message);
	}

	// convenience method for appending to querystring
	function addUrlLiveReloadCounter(url) {
		return url + (url.indexOf('?') > 0 ? '&' : '?') + "lr-c=" + counter;
	}

	// starts changes-checking with interval 
	function setupTimer() {
		logMessage('running. Call .stop() to stop.');
		updateDashboardState(liveReloadStates.RUNNING);
		indexStyleSheets();
	}

	// stop timer
	function stopTimer() {
		logMessage('stopped. Call .start() to start.');
		updateDashboardState(liveReloadStates.STOPPED);
	}

	// callback for when new css has been loaded
	function cssLoadedCallback(callBackInfo) {
		var previousUrl = callBackInfo.getAttribute('data-livereload-previousurl');
        var callbackCountItem = callBackInfo.getAttribute('data-livereload-count');

		if (previousUrl) {
			var styleSheetCount = document.styleSheets.length;
			for(var index = 0; index !== styleSheetCount; index++) {
				var styleItem = document.styleSheets[index];
				if (styleItem && styleItem.href === previousUrl) {
					
					var prevCountItem = styleItem.ownerNode && styleItem.ownerNode.getAttribute('data-livereload-count');
					if (prevCountItem && prevCountItem !== callbackCountItem) {
						styleItem.ownerNode.remove();
					} else {
						styleItem.ownerNode.remove();
					}
				}
			}
		} else {
			logMessage('no previousurl found on item');
		}
	}

	// callback for when new css has failed to load
	function cssLoadFailCallback(callBackInfo) {
		callBackInfo && callBackInfo.remove && callBackInfo.remove();
	}

	// load up redirects, to rewrite existing css to new ones
	function loadRedirects(redirects, matchOverride = '') {
		logMessage(' loaded redirects' + redirects);
		loadedRedirects = redirects;

		var styleSheetCount = document.styleSheets.length;
		for( var index = 0; index !== styleSheetCount; index++) {
			var styleItem = document.styleSheets[index];
			var styleHref = styleItem.href;

			if (typeof styleHref === "string") {
				redirects.map(function(redirectItem) {
					var urlMatches = styleHref.toLocaleLowerCase().match(redirectItem.urlContains.toLowerCase()); 
					if (urlMatches !== null && redirectItem.rewriteTo) {
						let newRewriteTo = redirectItem.rewriteTo; 
						if (newRewriteTo.indexOf('[MATCH]')) {

							var matchContent = '';
							if (matchOverride.length > 0) {
								matchContent = matchOverride;
							} else if (urlMatches.length >= 2) {
								matchContent = urlMatches[1];
							}

							newRewriteTo = newRewriteTo.replace('[MATCH]', matchContent);
						}
						logMessage('rewriting ' + styleHref + ' to ' + newRewriteTo);
						
						// rewrite matched url to whatever we want
						var ownerNode = styleItem.ownerNode;
						ownerNode.href = getRewriteUrl() + newRewriteTo;
					}
				});
			}
		}
	}

	// restrict which domains are reloaded
	function setUrlFilters(domainsList) {
		urlFilters = domainsList;
		logMessage('restricting livereload url\'s to: ' + domainsList);
	}

	function setRewriteBaseDomain(baseDomain) {
		if (typeof baseDomain === 'string' && baseDomain.length > 0 && baseDomain.length <= 22) { 	// max length ip-address + 6 digit portnumber, e.g. 192.168.255.255:123456
			baseDomain = baseDomain.toLowerCase().trim();

			if (baseDomain === 'localhost' || baseDomain.indexOf('localhost:') === 0 ||
				baseDomain === '127.0.0.1' || baseDomain.indexOf('127.0.0.1:') === 0 || 
				baseDomain.indexOf('10.') === 0 || baseDomain.indexOf('172.') === 0 || baseDomain.indexOf('192.168.') === 0) {
				baseRewriteDomain = baseDomain;
			}
		} else {
			baseRewriteDomain = 'localhost';
		}
	}
	
	// loops through stylesheets
	function indexStyleSheets() {

		if (currentLiveReloadState !== liveReloadStates.RUNNING) {
			return;
		}

		counter++;

		var styleSheetCount = document.styleSheets.length;
		for( var index = 0; index !== styleSheetCount; index++) {
			
			var styleSheetElement = document.styleSheets[index]; 
			var styleUrl = styleSheetElement.href;
			
			if (!styleUrl) {
				continue;
			}
			
			// filter-restriction indicated, check if url is within this filter
			if (urlFilters && urlFilters.length > 0) {
				var withinRestrictedDomainslist = urlFilters.find((item) => {
					return styleUrl.match(item) !== null;
				});
				
				if (typeof withinRestrictedDomainslist === 'undefined') {
					continue;
				}
			}

			// rewritten element
			var counterOwnerNode = styleSheetElement.ownerNode.getAttribute('data-livereload-count');

			if (counterOwnerNode === counter.toString()) {
				continue;
			}

			// before adding the new url, do some bookkeeping
			// we need:
			// - original url, stored in data-livereload-originalurl
			var originalUrl = styleSheetElement.ownerNode.getAttribute('data-livereload-original-url');
			var newUrl = addUrlLiveReloadCounter(styleUrl);
			if (originalUrl) {
				newUrl = addUrlLiveReloadCounter(originalUrl);	// go through the cache by modified url, based on the originalurl
			} else {	// no data-live-reload-original-url just yet, add it now
				styleSheetElement.ownerNode.setAttribute('data-livereload-original-url', styleUrl);
			}

			var ownerNodeClone = styleSheetElement.ownerNode.cloneNode(true);
			ownerNodeClone.href = newUrl;
			ownerNodeClone.setAttribute('onload', 'document.moduleLiveReload.cssLoadedCallback(this)');
			ownerNodeClone.setAttribute('onerror', 'document.moduleLiveReload.cssLoadFailCallback(this)');
			ownerNodeClone.setAttribute('data-livereload-previousurl', styleSheetElement.ownerNode.href);
			ownerNodeClone.setAttribute('data-livereload-count', counter);
			
			// add the new url after the second one
			styleSheetElement.ownerNode.insertAdjacentElement && styleSheetElement.ownerNode.insertAdjacentElement('afterend', ownerNodeClone);
		}

		setTimeout(indexStyleSheets, intervalTiming);
	}

	return {
		start: setupTimer,
		stop: stopTimer,
		loadRedirects: loadRedirects,
		setUrlFilters: setUrlFilters,
		setRewriteBaseDomain: setRewriteBaseDomain,
		cssLoadedCallback: cssLoadedCallback,
		cssLoadFailCallback: cssLoadFailCallback,
		showDashboard: createIndicatorTemplate
	};
})(document);

// set up configuration
// document.moduleLiveReload.setUrlFilters(['www.hostname.com']); // optionally, set a filter for the url, e.g. to filter on hostname if a css-filename occurs multiple times, with different hosts
document.moduleLiveReload.setRewriteBaseDomain('127.0.0.1:8887');   // hostname of the file to rewrite to
document.moduleLiveReload.loadRedirects([
	{
		urlContains: 'stylesheetname.css',
		rewriteTo: '/stylesheetname.css'
	}
]);

document.moduleLiveReload.showDashboard();
//document.moduleLiveReload.start(); // uncomment to immediately start our module, otherwise, use the mini-dashboard on the page