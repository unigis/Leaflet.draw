/**
 * Leaflet.draw assumes that you have already included the Leaflet library.
 */
L.drawVersion = '0.4.2';
/**
 * @class L.Draw
 * @aka Draw
 *
 *
 * To add the draw toolbar set the option drawControl: true in the map options.
 *
 * @example
 * ```js
 *      var map = L.map('map', {drawControl: true}).setView([51.505, -0.09], 13);
 *
 *      L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
 *          attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
 *      }).addTo(map);
 * ```
 *
 * ### Adding the edit toolbar
 * To use the edit toolbar you must initialise the Leaflet.draw control and manually add it to the map.
 *
 * ```js
 *      var map = L.map('map').setView([51.505, -0.09], 13);
 *
 *      L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
 *          attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
 *      }).addTo(map);
 *
 *      // FeatureGroup is to store editable layers
 *      var drawnItems = new L.FeatureGroup();
 *      map.addLayer(drawnItems);
 *
 *      var drawControl = new L.Control.Draw({
 *          edit: {
 *              featureGroup: drawnItems
 *          }
 *      });
 *      map.addControl(drawControl);
 * ```
 *
 * The key here is the featureGroup option. This tells the plugin which FeatureGroup contains the layers that
 * should be editable. The featureGroup can contain 0 or more features with geometry types Point, LineString, and Polygon.
 * Leaflet.draw does not work with multigeometry features such as MultiPoint, MultiLineString, MultiPolygon,
 * or GeometryCollection. If you need to add multigeometry features to the draw plugin, convert them to a
 * FeatureCollection of non-multigeometries (Points, LineStrings, or Polygons).
 */
L.Draw = {};

/**
 * @class L.drawLocal
 * @aka L.drawLocal
 *
 * The core toolbar class of the API — it is used to create the toolbar ui
 *
 * @example
 * ```js
 *      var modifiedDraw = L.drawLocal.extend({
 *          draw: {
 *              toolbar: {
 *                  buttons: {
 *                      polygon: 'Draw an awesome polygon'
 *                  }
 *              }
 *          }
 *      });
 * ```
 *
 * The default state for the control is the draw toolbar just below the zoom control.
 *  This will allow map users to draw vectors and markers.
 *  **Please note the edit toolbar is not enabled by default.**
 */
L.drawLocal = {
	// format: {
	// 	numeric: {
	// 		delimiters: {
	// 			thousands: ',',
	// 			decimal: '.'
	// 		}
	// 	}
	// },
	draw: {
		toolbar: {
			// #TODO: this should be reorganized where actions are nested in actions
			// ex: actions.undo  or actions.cancel
			actions: {
				title: '取消绘制',
				text: '取消'
			},
			finish: {
				title: '结束绘制',
				text: '完成'
			},
			undo: {
				title: '删除最近绘制一个点',
				text: '删除最近绘制一个点'
			},
			buttons: {
				polyline: '折线',
				polygon: '多边形',
				rectangle: '矩形',
				circle: '圆形',
				marker: '地图标记',
				circlemarker: '绘制圆形注记',
				bezier: '绘制箭头',
				arrow:'方向箭头'
			}
		},
		handlers: {
			circle: {
				tooltip: {
					start: '点击画圆'
				},
				radius: '半径'
			},
			circlemarker: {
				tooltip: {
					start: '标记圆形图标'
				}
			},
			marker: {
				tooltip: {
					start: '标记图标'
				}
			},
			polygon: {
				tooltip: {
					start: '',
					cont: '',
					end: ''
				}
			},
			bezier: {
				tooltip: {
					start: '',
					end: ''
				}
			},
			arrow: {
				error: '',
				tooltip: {
					start: '',
					cont: '',
					end: ''
				}
			},
			polyline: {
				error: '<strong>Error:</strong> shape edges cannot cross!',
				tooltip: {
					start: '点击开始绘制',
					cont: '',
					end: '双击结束绘制'
				}
			},
			rectangle: {
				tooltip: {
					start: ''
				}
			},
			simpleshape: {
				tooltip: {
					end: ''
				}
			}
		}
	},
	edit: {
		toolbar: {
			actions: {
				save: {
					title: '保存',
					text: '保存'
				},
				cancel: {
					title: '取消编辑',
					text: '取消'
				},
				clearAll: {
					title: '清空图层',
					text: '清空'
				}
			},
			buttons: {
				edit: '编辑图层',
				editDisabled: '没有可编辑的图层',
				remove: '删除图层',
				removeDisabled: '没有可删除的图层'
			}
		},
		handlers: {
			edit: {
				tooltip: {
					text: '拖动边界要素',
					subtext: '撤销'
				}
			},
			remove: {
				tooltip: {
					text: '点击移动地图要素'
				}
			}
		}
	}
};
