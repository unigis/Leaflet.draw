/**
 * @class L.Draw.Bezier
 * @aka Draw.Bezier
 * @inherits L.Draw.Bezier
 */
L.Draw.Bezier = L.Draw.Feature.extend({
	statics: {
		TYPE: 'bezier'
	},

	Poly: L.Polyline,

	options: {
		allowIntersection: true,
		repeatMode: false,
		drawError: {
			color: '#b00b00',
			timeout: 2500
		},
		icon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon'
		}),
		touchIcon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-touch-icon'
		}),
		guidelineDistance: 20,
		maxGuideLineLength: 4000,
		shapeOptions: {
			stroke: true,
			color: '#3388ff',
			weight: 4,
			opacity: 0.5,
			fill: false,
			clickable: true
		},
		metric: true, // Whether to use the metric measurement system or imperial
		feet: true, // When not metric, to use feet instead of yards for display.
		nautic: false, // When not metric, not feet use nautic mile for display
		showLength: true, // Whether to display distance in the tooltip
		zIndexOffset: 2000, // This should be > than the highest z-index any map layers
		factor: 1, // To change distance calculation
		maxPoints: 0 // Once this number of points are placed, finish shape
	},

	// @method initialize(): void
	initialize: function (map, options) {
		// if touch, switch to touch icon
		if (L.Browser.touch) {
			this.options.icon = this.options.touchIcon;
		}

		// Need to set this here to ensure the correct message is used.
		this.options.drawError.message = L.drawLocal.draw.handlers.polyline.error;

		// Merge default drawError options with custom options
		if (options && options.drawError) {
			options.drawError = L.Util.extend({}, this.options.drawError, options.drawError);
		}

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Polyline.TYPE;

		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},

	// @method addHooks(): void
	// Add listener hooks to this handler
	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if (this._map) {
			this._markers = [];

			this._markerGroup = new L.LayerGroup();
			this._map.addLayer(this._markerGroup);

			this._poly = new L.Polyline([], this.options.shapeOptions);

			this._tooltip.updateContent(this._getTooltipText());

			// Make a transparent marker that will used to catch click events. These click
			// events will create the vertices. We need to do this so we can ensure that
			// we can create vertices over other map layers (markers, vector layers). We
			// also do not want to trigger any click handlers of objects we are clicking on
			// while drawing.
			if (!this._mouseMarker) {
				this._mouseMarker = L.marker(this._map.getCenter(), {
					icon: L.divIcon({
						className: 'leaflet-mouse-marker',
						iconAnchor: [20, 20],
						iconSize: [40, 40]
					}),
					opacity: 0,
					zIndexOffset: this.options.zIndexOffset
				});
			}

			this._mouseMarker
				.on('mouseout', this._onMouseOut, this)
				.on('mousemove', this._onMouseMove, this) // Necessary to prevent 0.8 stutter
				.on('mousedown', this._onMouseDown, this)
				.on('mouseup', this._onMouseUp, this) // Necessary for 0.8 compatibility
				.addTo(this._map);

			this._map
				.on('mouseup', this._onMouseUp, this) // Necessary for 0.7 compatibility
				.on('mousemove', this._onMouseMove, this)
				.on('zoomlevelschange', this._onZoomEnd, this)
				.on('touchstart', this._onTouch, this)
				.on('zoomend', this._onZoomEnd, this);

		}
	},

	// @method removeHooks(): void
	// Remove listener hooks from this handler.
	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		this._clearHideErrorTimeout();

		this._cleanUpShape();

		// remove markers from map
		this._map.removeLayer(this._markerGroup);
		delete this._markerGroup;
		delete this._markers;

		this._map.removeLayer(this._poly);
		delete this._poly;

		this._mouseMarker
			.off('mousedown', this._onMouseDown, this)
			.off('mouseout', this._onMouseOut, this)
			.off('mouseup', this._onMouseUp, this)
			.off('mousemove', this._onMouseMove, this);
		this._map.removeLayer(this._mouseMarker);
		delete this._mouseMarker;

		// clean up DOM
		this._clearGuides();

		this._map
			.off('mouseup', this._onMouseUp, this)
			.off('mousemove', this._onMouseMove, this)
			.off('zoomlevelschange', this._onZoomEnd, this)
			.off('zoomend', this._onZoomEnd, this)
			.off('touchstart', this._onTouch, this)
			.off('click', this._onTouch, this);
	},

	// @method deleteLastVertex(): void
	// Remove the last vertex from the polyline, removes polyline from map if only one point exists.
	deleteLastVertex: function () {
		if (this._markers.length <= 1) {
			return;
		}

		var lastMarker = this._markers.pop(),
			poly = this._poly,
			// Replaces .spliceLatLngs()
			latlngs = poly.getLatLngs(),
			latlng = latlngs.splice(-1, 1)[0];
		this._poly.setLatLngs(latlngs);

		this._markerGroup.removeLayer(lastMarker);

		if (poly.getLatLngs().length < 2) {
			this._map.removeLayer(poly);
		}

		this._vertexChanged(latlng, false);
	},

	// @method addVertex(): void
	// Add a vertex to the end of the polyline
	addVertex: function (latlng) {
		var markersLength = this._markers.length;
		// markersLength must be greater than or equal to 2 before intersections can occur
		if (markersLength >= 2 && !this.options.allowIntersection && this._poly.newLatLngIntersects(latlng)) {
			this._showErrorTooltip();
			return;
		}
		else if (this._errorShown) {
			this._hideErrorTooltip();
		}

		this._markers.push(this._createMarker(latlng));

		this._poly.addLatLng(latlng);

		if (this._poly.getLatLngs().length === 2) {
			this._map.addLayer(this._poly);
		}

		this._vertexChanged(latlng, true);
	},

	// @method completeShape(): void
	// Closes the polyline between the first and last points
	completeShape: function () {
		if (this._markers.length <= 1 || !this._shapeIsValid()) {
			return;
		}

		this._fireCreatedEvent();
		this.disable();

		if (this.options.repeatMode) {
			this.enable();
		}
	},

	_finishShape: function () {
		var latlngs = this._poly._defaultShape ? this._poly._defaultShape() : this._poly.getLatLngs();
		var intersects = this._poly.newLatLngIntersects(latlngs[latlngs.length - 1]);

		if ((!this.options.allowIntersection && intersects) || !this._shapeIsValid()) {
			this._showErrorTooltip();
			return;
		}

		this._fireCreatedEvent();
		this.disable();
		if (this.options.repeatMode) {
			this.enable();
		}
	},

	// Called to verify the shape is valid when the user tries to finish it
	// Return false if the shape is not valid
	_shapeIsValid: function () {
		return true;
	},

	_onZoomEnd: function () {
		if (this._markers !== null) {
			this._updateGuide();
		}
	},

	_onMouseMove: function (e) {
		var newPos = this._map.mouseEventToLayerPoint(e.originalEvent);
		var latlng = this._map.layerPointToLatLng(newPos);

		// Save latlng
		// should this be moved to _updateGuide() ?
		this._currentLatLng = latlng;

		this._updateTooltip(latlng);

		// Update the guide line
		this._updateGuide(newPos);

		// Update the mouse marker position
        this._mouseMarker.setLatLng(latlng);
       


		L.DomEvent.preventDefault(e.originalEvent);
	},

	_vertexChanged: function (latlng, added) {
		this._map.fire(L.Draw.Event.DRAWVERTEX, {layers: this._markerGroup});
		this._updateFinishHandler();

		this._updateRunningMeasure(latlng, added);

		this._clearGuides();

		this._updateTooltip();
	},

	_onMouseDown: function (e) {
		if (!this._clickHandled && !this._touchHandled && !this._disableMarkers) {
			this._onMouseMove(e);
			this._clickHandled = true;
			this._disableNewMarkers();
			var originalEvent = e.originalEvent;
			var clientX = originalEvent.clientX;
			var clientY = originalEvent.clientY;
            this._startPoint.call(this, clientX, clientY);
		}
	},

	_startPoint: function (clientX, clientY) {
		this._mouseDownOrigin = L.point(clientX, clientY);
	},

	_onMouseUp: function (e) {
		var originalEvent = e.originalEvent;
		var clientX = originalEvent.clientX;
		var clientY = originalEvent.clientY;
		this._endPoint.call(this, clientX, clientY, e);
		this._clickHandled = null;
	},

	_endPoint: function (clientX, clientY, e) {
		if (this._mouseDownOrigin) {
			var dragCheckDistance = L.point(clientX, clientY)
				.distanceTo(this._mouseDownOrigin);
			var lastPtDistance = this._calculateFinishDistance(e.latlng);
			if (this.options.maxPoints > 1 && this.options.maxPoints == this._markers.length + 1) {
				this.addVertex(e.latlng);
				this._finishShape();
			} else if (lastPtDistance < 10 && L.Browser.touch) {
				this._finishShape();
			} else if (Math.abs(dragCheckDistance) < 9 * (window.devicePixelRatio || 1)) {
				this.addVertex(e.latlng);
			}
			this._enableNewMarkers(); // after a short pause, enable new markers
		}
		this._mouseDownOrigin = null;
	},

	// ontouch prevented by clickHandled flag because some browsers fire both click/touch events,
    // causing unwanted behavior
    //单次点击时触发
	_onTouch: function (e) {
        
		var originalEvent = e.originalEvent;
		var clientX;
		var clientY;
		if (originalEvent.touches && originalEvent.touches[0] && !this._clickHandled && !this._touchHandled && !this._disableMarkers) {
			clientX = originalEvent.touches[0].clientX;
			clientY = originalEvent.touches[0].clientY;
			this._disableNewMarkers();
			this._touchHandled = true;
			this._startPoint.call(this, clientX, clientY);
			this._endPoint.call(this, clientX, clientY, e);
			this._touchHandled = null;
		}
		this._clickHandled = null;
	},

	_onMouseOut: function () {
		if (this._tooltip) {
			this._tooltip._onMouseOut.call(this._tooltip);
		}
	},

	// calculate if we are currently within close enough distance
	// of the closing point (first point for shapes, last point for lines)
	// this is semi-ugly code but the only reliable way i found to get the job done
	// note: calculating point.distanceTo between mouseDownOrigin and last marker did NOT work
	_calculateFinishDistance: function (potentialLatLng) {
		var lastPtDistance;
		if (this._markers.length > 0) {
			var finishMarker;
			if (this.type === L.Draw.Polyline.TYPE) {
				finishMarker = this._markers[this._markers.length - 1];
			} else if (this.type === L.Draw.Polygon.TYPE) {
				finishMarker = this._markers[0];
			} else {
				return Infinity;
			}
			var lastMarkerPoint = this._map.latLngToContainerPoint(finishMarker.getLatLng()),
				potentialMarker = new L.Marker(potentialLatLng, {
					icon: this.options.icon,
					zIndexOffset: this.options.zIndexOffset * 2
				});
			var potentialMarkerPint = this._map.latLngToContainerPoint(potentialMarker.getLatLng());
			lastPtDistance = lastMarkerPoint.distanceTo(potentialMarkerPint);
		} else {
			lastPtDistance = Infinity;
		}
		return lastPtDistance;
	},

	_updateFinishHandler: function () {
		var markerCount = this._markers.length;
		// The last marker should have a click handler to close the polyline
		if (markerCount > 1) {
			this._markers[markerCount - 1].on('click', this._finishShape, this);
		}

		// Remove the old marker click handler (as only the last point should close the polyline)
		if (markerCount > 2) {
			this._markers[markerCount - 2].off('click', this._finishShape, this);
		}
	},

	_createMarker: function (latlng) {
		var marker = new L.Marker(latlng, {
			icon: this.options.icon,
			zIndexOffset: this.options.zIndexOffset * 2
		});

		this._markerGroup.addLayer(marker);

		return marker;
	},

    //更新当前鼠标移动的屏幕坐标
	_updateGuide: function (newPos) {
		var markerCount = this._markers ? this._markers.length : 0;

		if (markerCount > 0) {
			newPos = newPos || this._map.latLngToLayerPoint(this._currentLatLng);

			// 先清空原来的线
            this._clearGuides();
			//再重新绘制新的线
			var listLngs=[];
			if(markerCount >=2){
				for(var i =0;i<this._markers.length;i++){
					listLngs.push(this._markers[i].getLatLng())
				}
				listLngs.push(this._currentLatLng);
				this._drawBeizerGuide(listLngs);
			}else{
				this._drawGuide(
					this._map.latLngToLayerPoint(this._markers[markerCount - 1].getLatLng()),
					newPos
				);
			}
		}
	},

	_updateTooltip: function (latLng) {
		var text = this._getTooltipText();

		if (latLng) {
			this._tooltip.updatePosition(latLng);
		}

		if (!this._errorShown) {
			this._tooltip.updateContent(text);
		}
	},

	_clearSamePts:function (latlngs) {
		for (var e = latlngs.length, i = 0; i < e - 1;) 
		this._equalFuzzy(latlngs[i].lng, latlngs[i + 1].lng) && this._equalFuzzy(latlngs[i].lat, latlngs[i + 1].lat) ? (latlngs.splice(i, 1), e--) : i++;
        return latlngs
    },
	_drawBeizerGuide: function (latlngs) {
		this._poly.setLatLngs(this._clearSamePts(this._createBezierPt(this._getBezierDefaultPts(latlngs))));
	},
	_drawGuide: function (pointA, pointB) {
		var length = Math.floor(Math.sqrt(Math.pow((pointB.x - pointA.x), 2) + Math.pow((pointB.y - pointA.y), 2))),
			guidelineDistance = this.options.guidelineDistance,
			maxGuideLineLength = this.options.maxGuideLineLength,
			// Only draw a guideline with a max length
			i = length > maxGuideLineLength ? length - maxGuideLineLength : guidelineDistance,
			fraction,
			dashPoint,
			dash;

		//create the guides container if we haven't yet
		if (!this._guidesContainer) {
			this._guidesContainer = L.DomUtil.create('div', 'leaflet-draw-guides', this._overlayPane);
		}

		//draw a dash every GuildeLineDistance
		for (; i < length; i += this.options.guidelineDistance) {
			//work out fraction along line we are
			fraction = i / length;

			//calculate new x,y point
			dashPoint = {
				x: Math.floor((pointA.x * (1 - fraction)) + (fraction * pointB.x)),
				y: Math.floor((pointA.y * (1 - fraction)) + (fraction * pointB.y))
			};

			//add guide dash to guide container
			dash = L.DomUtil.create('div', 'leaflet-draw-guide-dash', this._guidesContainer);
			dash.style.backgroundColor =
				!this._errorShown ? this.options.shapeOptions.color : this.options.drawError.color;

			L.DomUtil.setPosition(dash, dashPoint);
		}
	},

	_updateGuideColor: function (color) {
		if (this._guidesContainer) {
			for (var i = 0, l = this._guidesContainer.childNodes.length; i < l; i++) {
				this._guidesContainer.childNodes[i].style.backgroundColor = color;
			}
		}
	},
	_distance: function (latlngA, latlngB) {
        return Math.sqrt((latlngA.lng - latlngB.lng) * (latlngA.lng - latlngB.lng) + (latlngA.lat - latlngB.lat) * (latlngA.lat - latlngB.lat))
    },

	// removes all child elements (guide dashes) from the guides container
	_clearGuides: function () {
		if (this._guidesContainer) {
			while (this._guidesContainer.firstChild) {
				this._guidesContainer.removeChild(this._guidesContainer.firstChild);
			}
		}
    },
    
    _getBezierDefaultPts:function(latlngs){
        var e = [], i = latlngs.length;
        if (i < 3) 
        {
            for (n = 0; n != i; ++n) 
            e[n] = latlngs[n].clone(); 
        }
        else {
			//{lat:0,lng:0}
            for (var o = 0, n = 0; n < 3 * i - 2; n += 3) 
            e[n] = latlngs[o].clone(), e[n + 1] = {lat:0,lng:0}, e[n + 2] = {lat:0,lng:0}, o++;
			for (n = 1; n < i - 1; n++) 
			this._getTrianglePoints(8, 3, latlngs[n - 1], latlngs[n], latlngs[n + 1], e[3 * n - 1], e[3 * n + 1]);
			this._getTrapezoidPoints(.6, e[0], e[3], e[2], e[1]), 
			this._getTrapezoidPoints(.6, e[3 * i - 3], e[3 * i - 6], e[3 * i - 5], e[3 * i - 4]), e[3 * i - 1] = e[3 * i - 2] = latlngs[i - 1].clone()	
        }
        return e        
    },
    _getTrianglePoints:function (t, e, i, o, n, s, a) {
        var l = i.lng, r = i.lat, u = o.lng, p = o.lat, h = n.lng, c = n.lat;
        this._getPointsByTriangle(t, e, l, r, u, p, h, c, s, a)
    },
    _getPointsByTriangle:function (t, e, i, o, n, s, a, l, r, u) {
        var p = n + (a - i), h = s + (l - o), c = 0, y = 0;
        if (i == a) c = i, y = h; else if (o == l) c = p, y = o; else {
            var g = 1 * (l - o) / (a - i), d = o - i * g;
            y = g * (c = (h + p / g - d) / (g + 1 / g)) + d
        }
        var f = Math.sqrt(1 * (n - p) * (n - p) + 1 * (s - h) * (s - h)),
            S = Math.sqrt(1 * (i - n) * (i - n) + 1 * (o - s) * (o - s)),
            P = Math.sqrt(1 * (n - a) * (n - a) + 1 * (s - l) * (s - l)), m = 0;
		p = c + (p - c) * (m = S + P ? 1 + (P - S) * t / (P + S) : 1), 
		h = y + (h - y) * m, 
		0 == f && (f = 1), 
		r.lng = n + (n - p) * S / (e * f), 
		r.lat = s + (s - h) * S / (e * f), 
		u.lng = n + (p - n) * P / (e * f), 
		u.lat = s + (h - s) * P / (e * f)
    },
    _getTrapezoidPoints:function (t, e, i, o, n) {
        var s = e.lng, a = e.lat, l = i.lng, r = i.lat, u = o.lng, p = o.lat;
        return this._getPointsByTrapezoid(t, s, a, l, r, u, p, n)
    }, 
    _getPointsByTrapezoid:function (t, e, i, o, n, s, a, l) {
        var r = 0, u = 0, p = 0, h = 0;
        if (0 == Math.abs(i - n)) r = e + o - s, u = a; else if (0 == Math.abs(e - o)) r = s, u = i + n - a; else {
            var c = 1 * (i - n) / (e - o), y = a - c * s;
            u = c * (r = ((n + i) / 2 + (e + o) / (2 * c) - y) / (c + 1 / c)) + y, r = 2 * r - s, u = 2 * u - a
        }
        var g = Math.sqrt(1 * (e - o) * (e - o) + 1 * (i - n) * (i - n)),
            d = Math.sqrt(1 * (e - r) * (e - r) + 1 * (i - u) * (i - u));
        return g > 0 ? (p = e + (o - e) * d / g, h = i + (n - i) * d / g) : (p = e, h = i), l.lng = p + (r - p) * t, l.lat = h + (u - h) * t, l
    },
    _createBezierPt:function(latlngs){
        var e = latlngs.length, i = [];
		if (latlngs.length < 3) 
		{for (o = 0; o < e; o++) i[o] = latlngs[o].clone(); }
		else {
            e /= 3;
            for (var o = 0; o < 3 * e && !(o + 4 >= 3 * e); o += 3) {
                var n = latlngs[o].lng, s = latlngs[o].lat, a = latlngs[o + 1].lng, l = latlngs[o + 1].lat, r = latlngs[o + 2].lng, u = latlngs[o + 2].lat,
                    p = latlngs[o + 3].lng, h = latlngs[o + 3].lat;
                if (this._equalFuzzy(n, a, 1e-10) && this._equalFuzzy(s, l, 1e-10) && this._equalFuzzy(r, p, 1e-10) && this._equalFuzzy(u, h, 1e-10)) i.push({lng:n, lat:s}), i.push({lng:r, lat:u}); else for (var c = 0; c <= 1; c += .03125) {
                    var y, g, d, f, S = c * c, P = S * c;
                    y = 1 - 3 * c + 3 * S - P, g = 3 * (c - 2 * S + P), d = 3 * (S - P), f = P;
                    var m = {lng:y * n + g * a + d * r + f * p, lat:y * s + g * l + d * u + f * h};
                    i.push(m)
                }
            }
        }
        return i
    },
    _equalFuzzy:function (t, e, i) {
        return i || (i = 1e-18), Math.abs(t - e) <= i
    },
	_getTooltipText: function () {
		var showLength = this.options.showLength,
			labelText, distanceStr;
		if (this._markers.length === 0) {
			labelText = {
				text: L.drawLocal.draw.handlers.polyline.tooltip.start
			};
		} else {
			distanceStr = showLength ? this._getMeasurementString() : '';

			if (this._markers.length === 1) {
				labelText = {
					text: L.drawLocal.draw.handlers.polyline.tooltip.cont,
					subtext: distanceStr
				};
			} else {
				labelText = {
					text: L.drawLocal.draw.handlers.polyline.tooltip.end,
					subtext: distanceStr
				};
			}
		}
		return labelText;
	},

	_updateRunningMeasure: function (latlng, added) {
		var markersLength = this._markers.length,
			previousMarkerIndex, distance;

		if (this._markers.length === 1) {
			this._measurementRunningTotal = 0;
		} else {
			previousMarkerIndex = markersLength - (added ? 2 : 1);

			// Calculate the distance based on the version
			if (L.GeometryUtil.isVersion07x()) {
				distance = latlng.distanceTo(this._markers[previousMarkerIndex].getLatLng()) * (this.options.factor || 1);
			} else {
				distance = this._map.distance(latlng, this._markers[previousMarkerIndex].getLatLng()) * (this.options.factor || 1);
			}

			this._measurementRunningTotal += distance * (added ? 1 : -1);
		}
	},

	_getMeasurementString: function () {
		var currentLatLng = this._currentLatLng,
			previousLatLng = this._markers[this._markers.length - 1].getLatLng(),
			distance;

		// Calculate the distance from the last fixed point to the mouse position based on the version
		if (L.GeometryUtil.isVersion07x()) {
			distance = previousLatLng && currentLatLng && currentLatLng.distanceTo ? this._measurementRunningTotal + currentLatLng.distanceTo(previousLatLng) * (this.options.factor || 1) : this._measurementRunningTotal || 0;
		} else {
			distance = previousLatLng && currentLatLng ? this._measurementRunningTotal + this._map.distance(currentLatLng, previousLatLng) * (this.options.factor || 1) : this._measurementRunningTotal || 0;
		}

		return L.GeometryUtil.readableDistance(distance, this.options.metric, this.options.feet, this.options.nautic, this.options.precision);
	},

	_showErrorTooltip: function () {
		this._errorShown = true;

		// Update tooltip
		this._tooltip
			.showAsError()
			.updateContent({text: this.options.drawError.message});

		// Update shape
		this._updateGuideColor(this.options.drawError.color);
		this._poly.setStyle({color: this.options.drawError.color});

		// Hide the error after 2 seconds
		this._clearHideErrorTimeout();
		this._hideErrorTimeout = setTimeout(L.Util.bind(this._hideErrorTooltip, this), this.options.drawError.timeout);
	},

	_hideErrorTooltip: function () {
		this._errorShown = false;

		this._clearHideErrorTimeout();

		// Revert tooltip
		this._tooltip
			.removeError()
			.updateContent(this._getTooltipText());

		// Revert shape
		this._updateGuideColor(this.options.shapeOptions.color);
		this._poly.setStyle({color: this.options.shapeOptions.color});
	},

	_clearHideErrorTimeout: function () {
		if (this._hideErrorTimeout) {
			clearTimeout(this._hideErrorTimeout);
			this._hideErrorTimeout = null;
		}
	},

	// disable new markers temporarily;
	// this is to prevent duplicated touch/click events in some browsers
	_disableNewMarkers: function () {
		this._disableMarkers = true;
	},

	// see _disableNewMarkers
	_enableNewMarkers: function () {
		setTimeout(function () {
			this._disableMarkers = false;
		}.bind(this), 50);
	},

	_cleanUpShape: function () {
		if (this._markers.length > 1) {
			this._markers[this._markers.length - 1].off('click', this._finishShape, this);
		}
	},

	_fireCreatedEvent: function () {
		var poly = new this.Poly(this._poly.getLatLngs(), this.options.shapeOptions);
		L.Draw.Feature.prototype._fireCreatedEvent.call(this, poly);
	}
});
