/* Module for handling the spatial querying
 */
this.ckan.module('spatial-query', function ($, _) {

  return {
    options: {
      map_config: {
        type: "custom",
        "custom_url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "attribution": "&copy; <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
      },
      i18n: {
      },
      style: {
        color: '#F06F64',
        weight: 2,
        opacity: 1,
        fillColor: '#F06F64',
        fillOpacity: 0.1,
        clickable: false
      },
      default_extent: [[90, 180], [-90, -180]]
    },
    template: {
      buttons: [
        '<div id="dataset-map-edit-buttons">',
        '<a href="javascript:;" class="btn cancel">Cancel</a> ',
        '<a href="javascript:;" class="btn apply disabled">Apply</a>',
        '</div>'
      ].join(''),
      modal: {
        bootstrap3: [
          '<div class="modal">',
          '<div class="modal-dialog modal-lg">',
          '<div class="modal-content">',
          '<div class="modal-header">',
          '<button type="button" class="close" data-dismiss="modal">×</button>',
          '<h3 class="modal-title"></h3>',
          '</div>',
          '<div class="modal-body"><div id="draw-map-container"></div></div>',
          '<div class="modal-footer">',
          '<button class="btn btn-default btn-cancel" data-dismiss="modal"></button>',
          '<button class="btn apply btn-primary disabled"></button>',
          '</div>',
          '</div>',
          '</div>',
          '</div>'
        ].join('\n'),
        bootstrap5: [
          '<div class="modal" tabindex="-1">',
          '<div class="modal-dialog modal-lg modal-spatial-query">',
          '<div class="modal-content">',
          '<div class="modal-header flex-row">',
          '<h4 class="modal-title"></h4>',
          '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
          '</div>',
          `<div class="modal-body">
            <p style="margin-bottom: 0;">Please use the pencil tool on the map to draw a rectangle to filter by location.</p>
            <p>You may also use the address search and select tools to help find a location.</p>
            <div class="search-address-wrapper" style="position: relative; display: inline-block;">
            <input class="rounded-2" id="search-address-box" type="text" placeholder="Search for an address." style="height: fit-content; padding-right: 40px;" />
            <button id="search-address-clear-button" type="button" class="d-none" style="position: absolute; top: 0; right: 0; border: none; background-color: transparent; cursor: pointer;">X</button>
            </div>
            <button class="btn btn-primary" type="button" id="search-address-button" disabled style="height: fit-content;">Search address</button>
            <div id="search-dropdown" class="dropdown d-inline-flex d-none" style="width: fit-content">
              <button class="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenu2" data-bs-toggle="dropdown" aria-expanded="false">
                View results
              </button>
              <ul id="search-dropdown-list" class="dropdown-menu" style="z-index: 1001;" aria-labelledby="dropdownMenu2"></ul>
            </div>
            <span id="no-results-text" class="d-none text-danger">No results found.</span>
            <div>
              <div class="d-flex gap-2 align-items-middle mb-2">
                <div style="width: 45%;">
                  <label for="public-search-categories">Select a feature category</label>
                  <select placeholder="Click here to select a category" id="public-search-categories" class="js-choice-category"></select>
                </div>
                <button id="clear-categories-button" class="d-none btn btn-danger" style="align-self: center; margin-top: 2rem;">Clear category</button>
                <button id="clear-bbox-button" class="d-none btn btn-danger" style="align-self: center; margin-top: 2rem;">Clear bounding box</button>
                <div id="choices-div" class="d-none" style="max-width: 55%;">
                  <label for="public-search-choices">Select features to view on the map</label>
                  <select multiple placeholder="Click here to select a feature" id="public-search-choices" class="js-choice"></select>
                </div>
              </div>
              <div id="draw-map-container">
            </div>
          </div></div>`,
          '<div class="modal-footer">',
          '<button type="button" class="btn btn-secondary btn-cancel" data-bs-dismiss="modal"></button>',
          '<button type="button" class="btn btn-primary apply disabled"></button>',
          '</div>',
          '</div>',
          '</div>',
          '</div>'
        ].join('\n')
      }
    },

    initialize: function () {
      var module = this;
      $.proxyAll(this, /_on/);
      module.placesData = window.__named_places;

      var user_default_extent = this.el.data('default_extent');
      if (user_default_extent ){
        if (user_default_extent instanceof Array) {
          // Assume it's a pair of coords like [[90, 180], [-90, -180]]
          this.options.default_extent = user_default_extent;
        } else if (user_default_extent instanceof Object) {
          // Assume it's a GeoJSON bbox
          this.options.default_extent = new L.GeoJSON(user_default_extent).getBounds();
        }
      }
      this.el.ready(this._onReady);
    },

    async runAddressSearch(search_query) {
      this.searchAddressButton.innerText = "Searching...";
      const nominatimEndpoint = `https://nominatim.openstreetmap.org/search?addressdetails=1&q=${search_query}&format=jsonv2&limit=10`;
      fetch(nominatimEndpoint, {
        headers: {
          "User-Agent": "ckanext-gztr extension user"
        },
        signal: AbortSignal.timeout(5000)
      }).then((res) => res.json().then((data) => {
        if (data && data.length > 1) {
          this.searchResults = data.map((entry) => { return { "display_name": entry.display_name, "boundingbox": entry.boundingbox }; })
          // Jump to first result.
          const firstBoundingBox = this.searchResults[0]["boundingbox"];
          this.drawMap.fitBounds([[firstBoundingBox[0], firstBoundingBox[2]], [firstBoundingBox[1], firstBoundingBox[3]]]);
          const searchDropdownList = document.getElementById("search-dropdown-list");
          // Remove previous search results
          while (searchDropdownList.hasChildNodes()) {
            searchDropdownList.removeChild(searchDropdownList.firstChild)
          }
          // Add search results to the dropdown
          for (const entry of this.searchResults) {
            const entryLi = document.createElement("li");
            const entryButton = document.createElement("button");
            entryButton.classList.add("dropdown-item");
            entryButton.type = "button";
            // entryButton.innerText = `${entry["display_name"]} | (${entry["lat"]}, ${entry["lon"]})`;
            entryButton.innerText = entry["display_name"];
            entryButton.onclick = () => {
              const boundingbox = entry["boundingbox"];
              this.drawMap.fitBounds([[boundingbox[0], boundingbox[2]], [boundingbox[1], boundingbox[3]]]);
            }
            entryLi.appendChild(entryButton);
            searchDropdownList.appendChild(entryLi);
          };
          this.searchDropdown.classList.remove("d-none");
        }
        else if (data && data.length > 0) {
          const boundingBox = data[0]["boundingbox"];
          this.drawMap.fitBounds([[boundingBox[0], boundingBox[2]], [boundingBox[1], boundingBox[3]]]);
        } else {
          this.noResultsText.classList.remove("d-none");
        }
      })).finally(() => {
        this.searchAddressButton.removeAttribute("disabled")
        this.searchAddressButton.innerText = "Search address";
      });
    },
    _getData: async function (value) {
      const url = this.sandbox.client.url(
        "/data" + "/" + this.placesData[value]
      );
      const response = await fetch(url);
      const json = await response.json();
      return topojson.feature(json, this.placesData[value].slice(0, -5));
    },
    _getBootstrapVersion: function () {
      return $.fn.modal.Constructor.VERSION.split(".")[0];
    },

    _createModal: function () {
      if (!this.modal) {
        var element = this.modal = jQuery(this.template.modal["bootstrap" + this._getBootstrapVersion()]);
        element.on('click', '.btn-primary', this._onApply);
        element.on('click', '.btn-cancel', this._onCancel);
        element.modal({show: false});

        element.find('.modal-title').text(this._('Filter by Location'));
        element.find('.apply').text(this._('Apply'));
        element.find('.btn-cancel').text(this._('Cancel'));

        var module = this;

        this.modal.on('shown.bs.modal', function () {
          if (module.drawMap) {
            module._setPreviousBBBox(map, zoom=false);
            map.fitBounds(module.mainMap.getBounds());

            $('a.leaflet-draw-draw-rectangle>span', element).trigger('click');
            return
          }
          module.baselayers = {
            "<span class=\"fs-2\">OSM</span>": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
              maxZoom: 19,
              attribution: "&copy; <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
            }),
            "<span class=\"fs-2\">Street</span>": L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}.png", {
              maxZoom: 19,
              // https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af
              attribution: "Tiles © Esri — Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCAN, Esri Japan, METI, Esri China (Hong Kong), NOSTRA, © OpenStreetMap contributors, and the GIS User Community"
            }),
            "<span class=\"fs-2\">Photo</span>": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.png", {
              maxZoom: 19,
              // https://doc.arcgis.com/en/data-appliance/2022/maps/world-imagery.htm
              attribution: "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            })
          };
          module.drawMap = map =  L.map('draw-map-container', {
            minZoom: 4,
            layers: [Object.values(module.baselayers).at(0)]
          }).setView([38.09024, -95.712891], 2);
          module.drawMap.attributionControl.setPrefix(false);
          module.clearBboxButton = document.getElementById("clear-bbox-button");
          module.clearBboxButton.onclick = (e) => {
            if (module.extentLayer) {
              module._onCancel();
              module.clearBboxButton.classList.add("d-none");
            }
          };
          // Set up named place category selector
          const categoriesElement = document.querySelector(".js-choice-category");
          const categories = new Choices(categoriesElement, {
            choices: [
              {
                label: "Features",
                choices: Object.keys(window.__named_places).map((key) => ({ label: key, value: window.__named_places[key] })),
              }
            ],
            searchResultLimit: -1,
            placeholderValue: "Click here to select a category"
          });

          // Set up named place selector for features using choices.js (https://github.com/Choices-js/Choices)
          const choicesElement = document.querySelector(".js-choice");
          const clearCategoryButton = document.querySelector("#clear-categories-button");
          const choicesDiv = document.querySelector("#choices-div");
          const choices = new Choices(choicesElement, {
            removeItemButton: true,
            searchResultLimit: -1,
            placeholderValue: "Click here to select a feature",
            duplicateItemsAllowed: false
          });

          categoriesElement.addEventListener("choice", (e) => {
            if (module.geojson)
              module.geojson.remove();
            const category = e.detail.label;
            const categoryPath = e.detail.value;
            // Display the features selector if the user selects a category, otherwise hide it
            if (category && categoryPath) {
              // choicesDiv.classList.remove("d-none");
            } else {
              choicesDiv.classList.add("d-none");
            }
            // Get the data for the specified choice and fill the features choices with that output
            module._getData(category)
              .then(data => {
                choices.clearChoices();
                const currentChoicesValues = choices.getValue(true);
                module.geojson = L.geoJSON({ features: [], type: 'FeatureCollection' }, {
                  style: function (feature, i) {
                    const color = ["#9e0142", "#d53e4f", "#f46d43", "#fdae61", "#abdda4", "#66c2a5", "#3288bd", "#5e4fa2"];
                    const colorIndex = feature.properties["GEOID"] % 8;
                    return {
                      fillColor: color[colorIndex],
                      color: color[colorIndex]
                    };
                  }
                }).bindPopup((e) => {
                  const container = jQuery('<ul>', { class: "fs-3" });
          
                  container.append(
                    jQuery('<li>', { class: 'list-member' })
                      .text(`Name: ${e.feature.properties.name}`)
                  );
                  container.append(
                    jQuery('<li>', { class: 'list-member' })
                      .text(`Type: ${category}`)
                  );
                  return container[0];
                });
                module.geojson.addData(data);
                module.geojson.addTo(map);
                choices.setChoices(
                  data.features.map((feature) => ({ "label": feature.properties.name, "value": {
                      "name": feature.properties.name,
                      "type": category,
                      "geometry": JSON.stringify(feature.geometry),
                    }
                  })).filter((f) => !(currentChoicesValues.filter((c) => c.name === f.value.name && c.type === f.value.type).length > 0)),
                  "value",
                  "label"
                );
              })
              .catch(err => {
                console.error("Error while attempting to get features data.");
              });
            clearCategoryButton.classList.remove("d-none");
            clearCategoryButton.onclick = (e) => { categories.clearChoices(false, true); categories.setChoices([
              {
                label: "Features",
                choices: Object.keys(window.__named_places).map((key) => ({ label: key, value: window.__named_places[key] })),
              }
              ]);
              module.geojson.clearLayers();
              clearCategoryButton.classList.add("d-none");
            };
          });
          choicesElement.addEventListener("choice", (e) => {
            const layer = L.geoJSON();
            const layerName = e.detail.value.name;
            const layerType = e.detail.value.type;
            const geometry = JSON.parse(e.detail.value.geometry);
            geometry.properties = { name: layerName, type: layerType };
            layer.addTo(map);
            layer.addData(geometry);
            // Selected polygons (both drawn or named) have a popup
            layer.bindPopup((e) => {
              const container = jQuery('<ul>', { class: "fs-3" });
              // Feature's name
              if (layerName)
                container.append(
                  jQuery('<li>', { class: 'list-member' })
                    .text(`Name: ${layerName}`)
                );

              // Feature's type
              if (layerType)
                container.append(
                  jQuery('<li>', { class: 'list-member' })
                    .text(`Type: ${layerType}`)
                );
              
              // "Remove this feature" button
              const buttonContainer = jQuery('<li>', { class: 'list-member' });
              const button = jQuery('<button>', {
              class: 'list-button',
              text: 'Remove this feature',
              click: (_e) => {
                _e.preventDefault();
                if (layer) {
                  map.removeLayer(layer);
                  const currentValues = choices.getValue();
                  const selectedValue = currentValues.filter((f) => f.value.name === layerName && f.value.type === layerType)[0];
                  if (selectedValue?.value)
                    choices.removeActiveItemsByValue(selectedValue?.value);
                }
              }
              });
              buttonContainer.append(button);
              container.append(buttonContainer);

              return container[0];
            });
            map.fitBounds(layer.getBounds());
          });
          choicesElement.addEventListener("removeItem", (e) => {
            for (const layer of map.pm.getGeomanLayers()) {
              if (layer.feature?.geometry?.properties?.name === e.detail.value.name && layer.feature?.geometry?.properties?.type === e.detail.value.type)
                map.removeLayer(layer);
            }
          });

          // Home button
          initEasyButton(L);
          const homeButton = L.easyButton({
            states: [{
              stateName: 'zoom-to-home',
              icon:      'fa-home',
              title:     'Zoom out to contiguous USA',
              onClick: function(btn, map) {
                map.fitBounds([[19.518344, -131.879883], [54.160455, -57.744141]]);
              }
            }]
          });
          homeButton.addTo(module.drawMap);
          // Initialize the draw control
          map.drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
              polyline: false,
              polygon: false,
              circle: false,
              circlemarker: false,
              marker: false,
              rectangle: {shapeOptions: module.options.style}
            }
          });
          map.addControl(map.drawControl);
          // Pan (drag hand) button
          const panButton = L.easyButton({
            states: [{
              stateName: 'pan',
              icon:      'fa-hand',
              title:     'Drag to pan',
              onClick: function(btn, map) {
                for (var toolbarId in map.drawControl._toolbars) {
                    map.drawControl._toolbars[toolbarId].disable();
                }
              }
            }]
          });
          panButton.addTo(module.drawMap);

          module._setPreviousBBBox(map, zoom=false);
          map.fitBounds(module.mainMap.getBounds());

          if (map.getZoom() == 0) {
            map.zoomIn();
          }

          map.on('draw:created', function (e) {
            if (module.extentLayer) {
              map.removeLayer(module.extentLayer);
            }
            module.extentLayer = extentLayer = e.layer;
            module.ext_bbox_input.val(extentLayer.getBounds().toBBoxString());
            map.addLayer(extentLayer);
            // Show clear bounding box button
            module.clearBboxButton.classList.remove("d-none");
            element.find('.btn-primary').removeClass('disabled').addClass('btn-primary');
          });

          $('a.leaflet-draw-draw-rectangle>span', element).trigger('click');
          element.find('.btn-primary').focus()

          // Search address feature
          module.searchAddressBox = document.getElementById('search-address-box');
          module.searchAddressButton = document.getElementById('search-address-button');
          module.searchAddressClearButton = document.getElementById('search-address-clear-button');
          module.searchAddressClearButton.onclick = (e) => {
            e?.preventDefault();
            module.searchAddressBox.value = "";
            module.searchAddressButton.setAttribute("disabled", true)
            module.searchAddressClearButton.classList.add("d-none");
          }
          module.searchDropdown = document.getElementById("search-dropdown");
          module.noResultsText = document.getElementById("no-results-text");
          // Disable default enter key behavior when pressing enter in the searchbox
          module.searchAddressBox.onkeydown = (e) => {
            module.noResultsText.classList.add("d-none");
            module.searchAddressClearButton.classList.remove("d-none");
            module.searchDropdown.classList.add("d-none");
            if (e.key === "Enter" && (!module.searchAddressButton.getAttribute("disabled") || module.searchAddressButton.getAttribute("disabled") === "false")) {
              e?.preventDefault();
            }
          }
          module.searchAddressBox.onkeyup = (e) => {
            e?.preventDefault();
            // When there is a value in the searchbox, enable the search button
            if (module.searchAddressBox.value) {
              module.searchAddressButton.removeAttribute("disabled")
            }
            // When the searchbox is empty, disable the search button
            else {
              module.searchAddressButton.setAttribute("disabled", true)
              module.searchAddressClearButton.classList.add("d-none");
            }
            // If the user presses the Enter key in the searchbox and the search button is not disabled, run the search
            if (e.key === "Enter" && (!module.searchAddressButton.getAttribute("disabled") || module.searchAddressButton.getAttribute("disabled") === "false")) {
              module.searchAddressButton.click();
            }
          }
          // If the search button is clicked, disable the search button and run the search
          module.searchAddressButton.onclick = (e) => {
            e?.preventDefault();
            module.searchAddressButton.setAttribute("disabled", true);
            module.runAddressSearch(module.searchAddressBox.value);
          }
        })

        this.modal.on('hidden.bs.modal', function () {
          for (var toolbarId in map.drawControl._toolbars) {
            map.drawControl._toolbars[toolbarId].disable();
          }
          document.getElementById('search-address-box').value = "";
          document.getElementById('search-address-button').setAttribute("disabled", true);
          document.getElementById('search-address-clear-button').classList.add("d-none");
          document.getElementById('search-address-clear-button').classList.add("d-none");
          document.getElementById('search-dropdown').classList.add("d-none");
          module._onCancel()
        });

      }
      return this.modal;
    },

    _getParameterByName: function (name) {
      var match = RegExp('[?&]' + name + '=([^&]*)')
                        .exec(window.location.search);
      return match ?
          decodeURIComponent(match[1].replace(/\+/g, ' '))
          : null;
    },

    _drawExtentFromCoords: function(xmin, ymin, xmax, ymax) {
        if ($.isArray(xmin)) {
            var coords = xmin;
            xmin = coords[0]; ymin = coords[1]; xmax = coords[2]; ymax = coords[3];
        }
        return new L.Rectangle([[ymin, xmin], [ymax, xmax]],
                               this.options.style);
    },

    _drawExtentFromGeoJSON: function(geom) {
        return new L.GeoJSON(geom, {style: this.options.style});
    },

    _onApply: function() {
      $(".search-form").submit();
    },

    _onCancel: function() {
      if (this.extentLayer) {
        this.drawMap.removeLayer(this.extentLayer);
      }
    },

    _createMap: function(container) {
      
      const baselayers = {
        "<span class=\"fs-3\">OSM</span>": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a>"
        }),
        "<span class=\"fs-3\">Street</span>": L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}.png", {
          maxZoom: 19,
          // https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af
          attribution: "Tiles © Esri — Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCAN, Esri Japan, METI, Esri China (Hong Kong), NOSTRA, © OpenStreetMap contributors, and the GIS User Community"
        }),
        "<span class=\"fs-3\">Photo</span>": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.png", {
          maxZoom: 19,
          // https://doc.arcgis.com/en/data-appliance/2022/maps/world-imagery.htm
          attribution: "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        })
      };
      
      map = ckan.commonLeafletMap(
        container,
        this.options.map_config,
        {
          pmIgnore: false,
          layers: [Object.values(baselayers).at(0)],
          attributionControl: false,
          drawControlTooltips: false,
        },
      );
      this.overlays = {};
      L.control.layers(baselayers, this.overlays).addTo(map);

      return map;

    },

    // Is there an existing box from a previous search?
    _setPreviousBBBox: function(map, zoom=true) {
      let module = this;
      previous_bbox = module._getParameterByName('ext_bbox');
      if (previous_bbox) {
        module.ext_bbox_input.val(previous_bbox);
        module.extentLayer = module._drawExtentFromCoords(previous_bbox.split(','))
        map.addLayer(module.extentLayer);
        if (zoom) {
          map.fitBounds(module.extentLayer.getBounds(), {"animate": false, "padding": [20, 20]});
        }
      } else {
        map.fitBounds(module.options.default_extent, {"animate": false});
      }
    },

    _onReady: function() {
      let module = this;
      let map;
      let form = $('#dataset-search-form');
      let bbox_input_id = 'ext_bbox';
      let statewide = 'statewide';

      // Add necessary field to the search form if not already created
      if ($("#" + bbox_input_id).length === 0) {
        $('<input type="hidden" />').attr({'id': bbox_input_id, 'name': bbox_input_id}).appendTo(form);
      }
      module.ext_bbox_input = $('#dataset-search-form #ext_bbox');
      // Add necessary field to the search form if not already created
      if ($("#" + statewide).length === 0) {
        $('<input type="hidden" />').attr({'id': statewide, 'name': statewide}).appendTo(form);
      }
      module.statewide = $('#dataset-search-form #statewide');


      // OK map time
      this.mainMap = map = this._createMap('dataset-map-container');
      // Remove layer selection from small dataset map
      document.getElementById("dataset-map-container").querySelector(".leaflet-control-layers").style.display = "none";

      var expandButton = L.Control.extend({
        position: 'topright',
        onAdd: function(map) {
          var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

          var button = L.DomUtil.create('a', 'leaflet-control-custom-button', container);
          button.innerHTML = '<i class="fa fa-pencil"></i>';
          button.title = module._('Draw an extent');

          L.DomEvent.on(button, 'click', function(e) {
            module.sandbox.body.append(module._createModal());
            module.modal.modal('show');

          });

          return container;
        }
      });
      map.addControl(new expandButton());

      module._setPreviousBBBox(map);

    }
  }
});
