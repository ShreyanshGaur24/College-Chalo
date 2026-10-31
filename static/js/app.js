/**
 * College-Chalo Main Application Controller
 * Live Map Homepage (Rapido & Uber style), Geolocation, Autocomplete, Routing,
 * Community Isolation (Student, Faculty, Staff), and Modal Handlers.
 */

class CollegeChaloApp {
    constructor() {
        this.currentUser = null;
        this.selectedCommunityRole = null;
        this.ridesList = [];
        this.bookings = { passenger_bookings: [], driver_bookings: [] };
        this.selectedRideForBooking = null;
        this.offerVehicleType = 'car';

        // Map state (Google Maps & Leaflet)
        this.map = null;
        this.googleRoadmapLayer = null;
        this.googleHybridLayer = null;
        this.currentMapType = 'roadmap';
        this.currentLocationMarker = null;
        this.destinationMarker = null;
        this.routeLayer = null;
        this.routeAccentLayer = null;

        // Coordinates & Locations (Default: Delhi Technological University Campus)
        this.userCoords = [28.7499, 77.1170];
        this.destCoords = null;
        this.pickupLocationText = "Delhi Technological University (DTU), Rohini";
        this.destinationLocationText = "";
        this.locationPermissionGranted = false;
        this.searchDebounceTimer = null;

        // Quick campus presets
        this.campusPresets = [
            { name: "Central Library, DTU Campus", lat: 28.7505, lng: 77.1179, subtitle: "Academic Block, Main Campus" },
            { name: "Samaypur Badli Metro Station", lat: 28.7460, lng: 77.1350, subtitle: "Yellow Line Metro Hub" },
            { name: "Hostel Block C & D", lat: 28.7530, lng: 77.1130, subtitle: "Residential Quad, DTU" },
            { name: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167, subtitle: "Central Delhi Commuter Circle" },
            { name: "North Campus, Delhi University", lat: 28.6890, lng: 77.2100, subtitle: "Arts Faculty & Metro Station" },
            { name: "Kashmere Gate ISBT, Delhi", lat: 28.6675, lng: 77.2304, subtitle: "Inter-State Bus Terminal" },
            { name: "Rohini Sector 16, New Delhi", lat: 28.7350, lng: 77.1180, subtitle: "Near City Centre Mall" }
        ];

        this.init();
    }

    async init() {
        this.handleSplashScreen();
        this.bindEvents();
        TestRunnerUI.init();

        // Initialize Live Map
        this.initMap();

        // Check existing user session
        const storedUser = ApiService.getStoredUser();
        if (storedUser) {
            try {
                const me = await ApiService.getMe();
                this.currentUser = me.user;
                ApiService.setStoredUser(this.currentUser);
                this.navigateToRoleHome(this.currentUser.community_role);
                this.updateUserWidgets();
                return;
            } catch (err) {
                console.warn("Session expired or invalid, switching to default demo.");
                ApiService.clearAuth();
            }
        }

        // Default to demo Student account for initial preview
        try {
            const demo = await ApiService.demoSwitch('student');
            this.currentUser = demo.user;
            this.navigateToRoleHome('student');
            this.updateUserWidgets();
        } catch (e) {
            this.navigateToRoleHome('student');
        }
    }

    // =========================================================================
    // 1. RAPIDO-STYLE MOBILITY SPLASH SCREEN (AT LEAST 5 SECONDS)
    // =========================================================================

    handleSplashScreen() {
        const splash = document.getElementById('splashScreen');
        if (!splash) return;

        // Respect user's reduced-motion preference if explicitly set
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // At least 5 full seconds of transition animation sequence
        const animationDuration = prefersReducedMotion ? 600 : 5000;

        setTimeout(() => {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
                splash.remove();
                // Ensure Leaflet map recalculates viewport after splash clears
                if (this.map) this.map.invalidateSize();
            }, 800);
        }, animationDuration);
    }

    // =========================================================================
    // 2. LIVE MAP INITIALIZATION & GEOLOCATION
    // =========================================================================

    initMap() {
        const mapContainer = document.getElementById('liveMap');
        if (!mapContainer) return;

        if (typeof L === 'undefined') {
            console.warn("Leaflet library not loaded yet, retrying...");
            setTimeout(() => this.initMap(), 300);
            return;
        }

        try {
            // Initialize map canvas centered at DTU Campus
            this.map = L.map('liveMap', {
                zoomControl: false,
                attributionControl: true
            }).setView(this.userCoords, 14);

            // 1. Google Maps Roadmap Layer (Standard Streets, Landmarks, Highways)
            this.googleRoadmapLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener">Google Maps</a>'
            });

            // 2. Google Maps Hybrid Layer (Satellite Imagery + Street Labels)
            this.googleHybridLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                subdomains: ['0', '1', '2', '3'],
                maxZoom: 20,
                attribution: '&copy; <a href="https://maps.google.com" target="_blank" rel="noopener">Google Maps</a>'
            });

            // Default: Google Maps Roadmap
            this.currentMapType = 'roadmap';
            this.googleRoadmapLayer.addTo(this.map);

            // Bind click on map to set destination directly
            this.map.on('click', (e) => {
                const { lat, lng } = e.latlng;
                this.setDestinationCoords(lat, lng, `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
            });

            // Start Geolocation detection
            this.detectUserLocation();

        } catch (err) {
            console.error("Google Maps initialization failed:", err);
        }
    }

    toggleGoogleMapLayer() {
        if (!this.map || !this.googleRoadmapLayer || !this.googleHybridLayer) return;

        const iconEl = document.getElementById('mapLayerToggleIcon');
        const btn = document.getElementById('mapLayerToggleBtn');

        if (this.currentMapType === 'roadmap') {
            this.map.removeLayer(this.googleRoadmapLayer);
            this.googleHybridLayer.addTo(this.map);
            this.currentMapType = 'hybrid';
            if (iconEl) iconEl.innerText = '🗺️';
            if (btn) btn.title = "Switch to Google Maps Streets View";
            showToast("Switched to Google Maps Satellite View", "info");
        } else {
            this.map.removeLayer(this.googleHybridLayer);
            this.googleRoadmapLayer.addTo(this.map);
            this.currentMapType = 'roadmap';
            if (iconEl) iconEl.innerText = '🛰️';
            if (btn) btn.title = "Switch to Google Maps Satellite View";
            showToast("Switched to Google Maps Street View", "info");
        }
    }

    detectUserLocation() {
        const loader = document.getElementById('mapLoader');
        const loaderText = document.getElementById('mapLoaderText');
        const pickupInput = document.getElementById('pickupLocationInput');

        if (loader) loader.classList.add('active');
        if (loaderText) loaderText.innerText = "Detecting your location...";

        if (!navigator.geolocation) {
            this.onLocationFallback("Geolocation is not supported by your browser.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                this.userCoords = [lat, lng];
                this.locationPermissionGranted = true;

                this.updateCurrentLocationMarker();
                if (this.map) {
                    this.map.flyTo(this.userCoords, 15, { animate: true, duration: 1.2 });
                }

                if (loader) loader.classList.remove('active');

                // Reverse geocode to get human readable address
                this.reverseGeocode(lat, lng);
            },
            (err) => {
                console.warn("Geolocation denied or timed out:", err.message);
                this.onLocationFallback("Location permission denied. Showing campus default.");
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }

    onLocationFallback(msg) {
        const loader = document.getElementById('mapLoader');
        if (loader) loader.classList.remove('active');

        // Center on Delhi Technological University
        this.userCoords = [28.7499, 77.1170];
        this.updateCurrentLocationMarker();
        if (this.map) {
            this.map.setView(this.userCoords, 14);
        }

        const pickupInput = document.getElementById('pickupLocationInput');
        if (pickupInput && (!pickupInput.value || pickupInput.value.includes("Detecting"))) {
            pickupInput.value = "Delhi Technological University (DTU), Main Gate";
            this.pickupLocationText = pickupInput.value;
        }

        if (msg) showToast(msg, "info");
    }

    updateCurrentLocationMarker() {
        if (!this.map || typeof L === 'undefined') return;

        const pulseHtml = `
            <div class="gps-pulse-outer">
                <div class="gps-pulse-inner"></div>
            </div>
        `;

        const pulseIcon = L.divIcon({
            className: 'custom-gps-icon',
            html: pulseHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        if (this.currentLocationMarker) {
            this.currentLocationMarker.setLatLng(this.userCoords);
        } else {
            this.currentLocationMarker = L.marker(this.userCoords, { icon: pulseIcon }).addTo(this.map);
            this.currentLocationMarker.bindPopup("<strong>Your Pickup Location</strong><br>Nearby rides will match from here.");
        }
    }

    async reverseGeocode(lat, lng) {
        const pickupInput = document.getElementById('pickupLocationInput');
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw new Error("Reverse geocode failed");
            const data = await res.json();

            let addressStr = "";
            if (data.address) {
                const parts = [
                    data.address.road || data.address.pedestrian || data.address.building,
                    data.address.suburb || data.address.neighbourhood || data.address.residential,
                    data.address.city || data.address.state_district || "Delhi"
                ].filter(Boolean);
                addressStr = parts.slice(0, 2).join(", ");
            }

            if (!addressStr && data.display_name) {
                addressStr = data.display_name.split(",").slice(0, 3).join(",");
            }

            if (!addressStr) addressStr = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

            this.pickupLocationText = addressStr;
            if (pickupInput) pickupInput.value = addressStr;

        } catch (e) {
            const fallbackText = "Current GPS Location";
            this.pickupLocationText = fallbackText;
            if (pickupInput) pickupInput.value = fallbackText;
        }
    }

    recenterMap() {
        if (!this.map) return;
        this.map.flyTo(this.userCoords, 15, { animate: true, duration: 1.0 });
        if (this.currentLocationMarker) {
            this.currentLocationMarker.openPopup();
        }
    }

    // =========================================================================
    // 3. DESTINATION SEARCH & AUTOCOMPLETE
    // =========================================================================

    handleDestinationInput(query) {
        const clearBtn = document.getElementById('clearDestBtn');
        const dropdown = document.getElementById('destinationSuggestions');
        if (!dropdown) return;

        if (clearBtn) {
            clearBtn.style.display = query.trim().length > 0 ? 'flex' : 'none';
        }

        if (!query || query.trim().length < 2) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        const qLower = query.toLowerCase().trim();

        // 1. Instant local campus preset matching
        const matchedPresets = this.campusPresets.filter(p => 
            p.name.toLowerCase().includes(qLower) || p.subtitle.toLowerCase().includes(qLower)
        );

        this.renderSuggestions(matchedPresets, dropdown, query);

        // 2. Debounced query to OpenStreetMap Nominatim Search
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(async () => {
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) return;
                const items = await res.json();

                const osmSuggestions = items.map(it => ({
                    name: it.display_name.split(",").slice(0, 2).join(",").trim(),
                    subtitle: it.display_name.split(",").slice(2, 4).join(",").trim() || "India",
                    lat: parseFloat(it.lat),
                    lng: parseFloat(it.lon)
                }));

                // Combine presets and live results
                const combined = [...matchedPresets];
                osmSuggestions.forEach(os => {
                    if (!combined.some(c => Math.abs(c.lat - os.lat) < 0.005 && Math.abs(c.lng - os.lng) < 0.005)) {
                        combined.push(os);
                    }
                });

                this.renderSuggestions(combined, dropdown, query);
            } catch (e) {
                // Keep presets visible on network error
            }
        }, 350);
    }

    renderSuggestions(items, dropdown, currentQuery) {
        if (!items || items.length === 0) {
            dropdown.innerHTML = `
                <div class="suggestion-item" style="cursor: default; color: var(--text-muted); font-size: 0.85rem;">
                    No landmarks matching "${currentQuery}". Press Enter to search on map.
                </div>
            `;
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <div class="suggestion-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                </div>
                <div class="suggestion-text">
                    <div class="suggestion-title">${item.name}</div>
                    <div class="suggestion-subtitle">${item.subtitle || 'Delhi Campus Area'}</div>
                </div>
            `;

            div.addEventListener('click', () => {
                this.setDestinationCoords(item.lat, item.lng, item.name);
                dropdown.style.display = 'none';
            });

            dropdown.appendChild(div);
        });

        dropdown.style.display = 'block';
    }

    setDestinationCoords(lat, lng, displayName) {
        this.destCoords = [lat, lng];
        this.destinationLocationText = displayName;

        const destInput = document.getElementById('destinationLocationInput');
        if (destInput) destInput.value = displayName;

        const clearBtn = document.getElementById('clearDestBtn');
        if (clearBtn) clearBtn.style.display = 'flex';

        const dropdown = document.getElementById('destinationSuggestions');
        if (dropdown) dropdown.style.display = 'none';

        // Drop destination marker on map
        this.updateDestinationMarker();

        // Calculate and display route
        this.calculateAndDrawRoute();
    }

    updateDestinationMarker() {
        if (!this.map || !this.destCoords || typeof L === 'undefined') return;

        const pinHtml = `
            <div class="dest-marker-pin">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#0f172a" stroke="#ffffff" stroke-width="1.5">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5" fill="#bda688"/>
                </svg>
            </div>
        `;

        const destIcon = L.divIcon({
            className: 'custom-dest-icon',
            html: pinHtml,
            iconSize: [28, 28],
            iconAnchor: [14, 28]
        });

        if (this.destinationMarker) {
            this.destinationMarker.setLatLng(this.destCoords);
        } else {
            this.destinationMarker = L.marker(this.destCoords, { icon: destIcon }).addTo(this.map);
        }

        this.destinationMarker.bindPopup(`<strong>Destination:</strong><br>${this.destinationLocationText}`).openPopup();
    }

    clearDestination() {
        this.destCoords = null;
        this.destinationLocationText = "";

        const destInput = document.getElementById('destinationLocationInput');
        if (destInput) destInput.value = "";

        const clearBtn = document.getElementById('clearDestBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        const dropdown = document.getElementById('destinationSuggestions');
        if (dropdown) dropdown.style.display = 'none';

        const routeStrip = document.getElementById('routeSummaryStrip');
        if (routeStrip) routeStrip.style.display = 'none';

        if (this.destinationMarker && this.map) {
            this.map.removeLayer(this.destinationMarker);
            this.destinationMarker = null;
        }

        if (this.routeLayer && this.map) {
            this.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }

        if (this.routeAccentLayer && this.map) {
            this.map.removeLayer(this.routeAccentLayer);
            this.routeAccentLayer = null;
        }

        if (this.map) {
            this.map.flyTo(this.userCoords, 14, { animate: true });
        }
    }

    // =========================================================================
    // 4. ROUTE CALCULATION (OSRM + HAVERSINE ESTIMATION)
    // =========================================================================

    async calculateAndDrawRoute() {
        if (!this.map || !this.userCoords || !this.destCoords || typeof L === 'undefined') return;

        // Baseline geodesic distance
        const directKm = this.getHaversineKm(this.userCoords, this.destCoords);
        const roadKm = (directKm * 1.25).toFixed(1);
        const estMinutes = Math.max(5, Math.round((roadKm / 28) * 60)); // ~28 km/h city carpool speed

        const routeStrip = document.getElementById('routeSummaryStrip');
        const durationText = document.getElementById('routeDurationText');
        const distanceText = document.getElementById('routeDistanceText');

        if (durationText) durationText.innerText = `~${estMinutes} mins`;
        if (distanceText) distanceText.innerText = `${roadKm} km`;
        if (routeStrip) routeStrip.style.display = 'flex';

        // Attempt real route geometry via OSRM public service
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${this.userCoords[1]},${this.userCoords[0]};${this.destCoords[1]},${this.destCoords[0]}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(osrmUrl);
            if (!res.ok) throw new Error("OSRM service unreachable");
            const data = await res.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const actualDistanceKm = (route.distance / 1000).toFixed(1);
                const actualMins = Math.max(5, Math.round(route.duration / 60));

                if (distanceText) distanceText.innerText = `${actualDistanceKm} km`;
                if (durationText) durationText.innerText = `~${actualMins} mins`;

                // Remove previous route layers
                if (this.routeLayer) this.map.removeLayer(this.routeLayer);
                if (this.routeAccentLayer) this.map.removeLayer(this.routeAccentLayer);

                // Draw outer dark line
                this.routeLayer = L.geoJSON(route.geometry, {
                    style: {
                        color: '#0f172a',
                        weight: 6,
                        opacity: 0.9,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }
                }).addTo(this.map);

                // Draw inner warm mobility beige accent
                this.routeAccentLayer = L.geoJSON(route.geometry, {
                    style: {
                        color: '#c9b497',
                        weight: 3,
                        opacity: 1,
                        lineCap: 'round',
                        lineJoin: 'round'
                    }
                }).addTo(this.map);

                // Fit map viewport smoothly to show entire route
                this.map.fitBounds(this.routeLayer.getBounds(), {
                    padding: [80, 80],
                    maxZoom: 16
                });
                return;
            }
        } catch (e) {
            console.warn("Using fallback route polyline:", e.message);
        }

        // Fallback: draw clean direct line between coordinates
        if (this.routeLayer) this.map.removeLayer(this.routeLayer);
        if (this.routeAccentLayer) this.map.removeLayer(this.routeAccentLayer);

        this.routeLayer = L.polyline([this.userCoords, this.destCoords], {
            color: '#0f172a',
            weight: 5,
            dashArray: '8, 8',
            opacity: 0.8
        }).addTo(this.map);

        this.map.fitBounds([this.userCoords, this.destCoords], {
            padding: [70, 70],
            maxZoom: 15
        });
    }

    getHaversineKm(coords1, coords2) {
        const R = 6371; // Earth radius in km
        const dLat = (coords2[0] - coords1[0]) * Math.PI / 180;
        const dLon = (coords2[1] - coords1[1]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(coords1[0] * Math.PI / 180) * Math.cos(coords2[0] * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // =========================================================================
    // 5. "FIND A RIDE" ACTION & COMMUNITY RIDES SHEET
    // =========================================================================

    async handleFindRide() {
        const pickup = document.getElementById('pickupLocationInput')?.value.trim();
        const dest = document.getElementById('destinationLocationInput')?.value.trim();

        if (!dest) {
            showToast("Please enter your destination first.", "info");
            document.getElementById('destinationLocationInput')?.focus();
            return;
        }

        const role = this.currentUser ? this.currentUser.community_role : 'student';
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

        const findBtn = document.getElementById('findRideBtn');
        if (findBtn) {
            findBtn.disabled = true;
            findBtn.innerHTML = `<span>Searching ${roleLabel} Rides...</span>`;
        }

        try {
            // First search with specific destination filter
            let data = await ApiService.getRides({ destination: dest });
            let rides = data.rides || [];

            // If no rides match the exact text, query all available upcoming rides in this role
            if (rides.length === 0) {
                const allData = await ApiService.getRides({});
                rides = allData.rides || [];
            }

            this.ridesList = rides;
            this.renderMatchingRidesSheet(rides, roleLabel, pickup, dest);
            this.openMatchingRidesSheet();

        } catch (err) {
            showToast(`Error searching rides: ${err.message}`, "error");
        } finally {
            if (findBtn) {
                findBtn.disabled = false;
                findBtn.innerHTML = `
                    <span>Find a Ride</span>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                `;
            }
        }
    }

    renderMatchingRidesSheet(rides, roleLabel, pickup, dest) {
        const container = document.getElementById('matchingRidesList');
        const sheetTitle = document.getElementById('sheetTitle');
        const sheetSubtitle = document.getElementById('sheetSubtitle');

        if (sheetTitle) sheetTitle.innerText = `${roleLabel} Community Rides`;
        if (sheetSubtitle) sheetSubtitle.innerText = `Verified ${roleLabel} members commuting to ${dest || 'Campus'}`;

        if (!container) return;

        if (!rides || rides.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 36px 16px;">
                    <div style="font-size: 2.2rem; margin-bottom: 8px;">🚗</div>
                    <h4 style="font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-bottom: 6px;">No Active ${roleLabel} Rides Yet</h4>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 18px;">
                        Be the first verified ${roleLabel} member to offer a carpool ride for this route!
                    </p>
                    <button type="button" class="btn btn-primary btn-block btn-md" onclick="app.openOfferRideModal('${pickup}', '${dest}')">
                        Offer This Ride to Community
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        rides.forEach(ride => {
            const card = document.createElement('div');
            card.className = 'ride-card';
            const isOwnRide = this.currentUser && this.currentUser.id === ride.driver_id;
            const isBike = ride.vehicle_type === 'bike';
            const vehiclePill = isBike ?
                `<span class="vehicle-pill bike">🛵 Bike</span>` :
                `<span class="vehicle-pill car">🚗 Car</span>`;
            const seatsLeftStr = isBike ?
                `<strong>${ride.available_seats}</strong> bike seat` :
                `<strong>${ride.available_seats} of ${ride.total_seats}</strong> seats left`;

            card.innerHTML = `
                <div>
                    <div class="ride-card-header">
                        <div class="driver-info-box">
                            <img class="driver-avatar" src="${ride.driver_avatar}" alt="${ride.driver_name}">
                            <div class="driver-meta">
                                <h4>${ride.driver_name}</h4>
                                <span>${ride.driver_card_id || 'Verified ID'} • ${ride.driver_university}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            ${vehiclePill}
                            <span class="role-badge ${ride.community_role}">${ride.community_role}</span>
                        </div>
                    </div>

                    <div class="ride-route">
                        <div class="route-stop">
                            <span class="route-indicator origin"></span>
                            <span>${ride.origin}</span>
                        </div>
                        <div class="route-stop">
                            <span class="route-indicator destination"></span>
                            <span>${ride.destination}</span>
                        </div>
                    </div>

                    <div class="ride-details-row">
                        <div>
                            <span style="display: block; font-size: 0.72rem; color: var(--text-muted);">DEPARTURE</span>
                            <strong>${ride.departure_time}</strong>
                        </div>
                        <div style="text-align: right;">
                            <span style="display: block; font-size: 0.72rem; color: var(--text-muted);">CAPACITY</span>
                            ${seatsLeftStr}
                        </div>
                    </div>

                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                        ${isBike ? '🛵 Bike / Scooter:' : '🚗 Car:'} <strong>${ride.car_model || (isBike ? 'Standard Bike' : 'Standard Car')}</strong> (${ride.car_plate || 'Verified'})
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; pt: 10px; border-top: 1px solid var(--border-light);">
                    <div>
                        <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Per Seat</span>
                        <span class="ride-price">₹${Math.round(ride.price_per_seat)}</span>
                    </div>
                    <div>
                        ${isOwnRide ? 
                            `<span class="btn btn-secondary btn-sm" style="cursor: default; opacity: 0.8;">Your Ride</span>` :
                            `<button class="btn btn-primary btn-sm book-ride-btn" data-ride-id="${ride.id}">
                                Book Ride
                            </button>`
                        }
                    </div>
                </div>
            `;


            container.appendChild(card);
        });

        // Attach book ride click listeners
        container.querySelectorAll('.book-ride-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const rideId = btn.getAttribute('data-ride-id');
                this.openBookingModal(rideId);
            });
        });
    }

    openMatchingRidesSheet() {
        const sheet = document.getElementById('matchingRidesSheet');
        if (sheet) sheet.classList.add('active');
    }

    closeMatchingRidesSheet() {
        const sheet = document.getElementById('matchingRidesSheet');
        if (sheet) sheet.classList.remove('active');
    }

    toggleMatchingRidesSheet() {
        const sheet = document.getElementById('matchingRidesSheet');
        if (sheet) sheet.classList.toggle('active');
    }

    // =========================================================================
    // 6. MOBILITY DRAWER & SUBVIEWS NAVIGATION
    // =========================================================================

    toggleMobilityDrawer() {
        const drawer = document.getElementById('mobilityDrawer');
        const backdrop = document.getElementById('mobilityDrawerBackdrop');
        if (drawer && backdrop) {
            const isActive = drawer.classList.contains('active');
            if (isActive) {
                this.closeMobilityDrawer();
            } else {
                this.openMobilityDrawer();
            }
        }
    }

    openMobilityDrawer() {
        const drawer = document.getElementById('mobilityDrawer');
        const backdrop = document.getElementById('mobilityDrawerBackdrop');
        if (drawer) drawer.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
    }

    closeMobilityDrawer() {
        const drawer = document.getElementById('mobilityDrawer');
        const backdrop = document.getElementById('mobilityDrawerBackdrop');
        if (drawer) drawer.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }

    showView(viewId) {
        // Hide all views
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Toggle map active state on body
        if (viewId === 'mapHomeView' || viewId.includes('Home')) {
            document.body.classList.add('map-view-active');
            if (this.map) {
                setTimeout(() => this.map.invalidateSize(), 200);
            }
            document.getElementById('mobileNavHome')?.classList.add('active');
        } else {
            document.body.classList.remove('map-view-active');
            document.getElementById('mobileNavHome')?.classList.remove('active');
        }

        // Update mobile bottom nav state
        document.querySelectorAll('.mobile-nav-item').forEach(btn => btn.classList.remove('active'));
        if (viewId === 'mapHomeView' || viewId.includes('Home')) {
            document.getElementById('mobileNavHome')?.classList.add('active');
        } else if (viewId === 'testSuiteView') {
            document.getElementById('mobileNavTests')?.classList.add('active');
        }
    }

    navigateToRoleHome(role) {
        if (!role && this.currentUser) role = this.currentUser.community_role;
        if (!role) role = 'student';

        // Update active role buttons in drawer
        document.querySelectorAll('.drawer-role-card').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-role') === role);
        });

        // Always show the interactive Live Map Homepage
        this.showView('mapHomeView');
        this.updateHomeLabels(role);
        this.loadUserBookings();
    }

    updateUserWidgets() {
        if (!this.currentUser) return;
        const role = this.currentUser.community_role;

        // Update user role badges
        document.querySelectorAll('.user-role-badge-display').forEach(el => {
            el.className = `role-badge ${role} user-role-badge-display`;
            el.innerText = role.charAt(0).toUpperCase() + role.slice(1);
        });

        // Update user names
        document.querySelectorAll('.user-name-display').forEach(el => {
            el.innerText = this.currentUser.full_name;
        });

        // Update user avatars
        document.querySelectorAll('.user-avatar-display').forEach(el => {
            if (el.tagName === 'IMG') el.src = this.currentUser.avatar_url;
        });

        // Update university name
        document.querySelectorAll('.user-uni-display').forEach(el => {
            el.innerText = this.currentUser.university_name;
        });
    }

    updateHomeLabels(role) {
        const prefix = role.charAt(0).toUpperCase() + role.slice(1);

        const mapRoleBadge = document.getElementById('mapRoleBadge');
        if (mapRoleBadge) {
            mapRoleBadge.className = `floating-role-tag ${role} user-role-badge-display`;
            mapRoleBadge.innerText = prefix;
        }

        const panelLockPill = document.getElementById('panelCommunityLockPill');
        if (panelLockPill) {
            panelLockPill.innerText = `🎓 ${prefix} Rides Only`;
            panelLockPill.className = `community-lock-pill ${role}`;
        }

        const offerRoleBadge = document.getElementById('offerRideRoleBadge');
        if (offerRoleBadge) {
            offerRoleBadge.className = `role-badge ${role}`;
            offerRoleBadge.innerText = `${prefix} Community Locked`;
        }
    }

    async switchDemoAccount(role) {
        try {
            const res = await ApiService.demoSwitch(role);
            this.currentUser = res.user;
            showToast(`Switched to ${role.toUpperCase()} community account (${res.user.full_name})`, "success");
            this.updateUserWidgets();
            this.navigateToRoleHome(role);
            this.closeMatchingRidesSheet();
        } catch (err) {
            showToast(`Demo switch failed: ${err.message}`, "error");
        }
    }

    // =========================================================================
    // 7. REGISTRATION, LOGIN, OFFER RIDE & BOOKING WORKFLOWS
    // =========================================================================

    selectRegistrationCategory(category) {
        this.selectedCommunityRole = category;
        const roleLabel = category.charAt(0).toUpperCase() + category.slice(1);

        const titleEl = document.getElementById('regFormCommunityTitle');
        const badgeEl = document.getElementById('regFormCommunityBadge');
        const idLabel = document.getElementById('regFormIdLabel');
        const idInput = document.getElementById('regIdNumber');
        const emailLabel = document.getElementById('regEmailLabel');
        const emailInput = document.getElementById('regEmail');

        if (titleEl) titleEl.innerText = `${roleLabel} Community Registration`;
        if (badgeEl) {
            badgeEl.className = `role-badge ${category}`;
            badgeEl.innerText = `${roleLabel} Role`;
        }

        if (category === 'student') {
            if (idLabel) idLabel.innerText = "Student ID or University UID";
            if (idInput) idInput.placeholder = "e.g., STU-2026-8901";
            if (emailLabel) emailLabel.innerText = "University Student Email";
            if (emailInput) emailInput.placeholder = "your.name@student.university.edu";
        } else if (category === 'faculty') {
            if (idLabel) idLabel.innerText = "Faculty / Employee ID";
            if (idInput) idInput.placeholder = "e.g., FAC-CS-104";
            if (emailLabel) emailLabel.innerText = "Official Faculty Email";
            if (emailInput) emailInput.placeholder = "prof.name@faculty.university.edu";
        } else if (category === 'staff') {
            if (idLabel) idLabel.innerText = "Staff / Employee ID";
            if (idInput) idInput.placeholder = "e.g., STF-AD-551";
            if (emailLabel) emailLabel.innerText = "Official Staff Email";
            if (emailInput) emailInput.placeholder = "staff.name@admin.university.edu";
        }

        this.showView('registrationFormView');
    }

    async handleRegistrationSubmit(e) {
        e.preventDefault();
        const role = this.selectedCommunityRole;
        if (!role) {
            showToast("Please choose your college community role first.", "error");
            this.showView('joinCommunityView');
            return;
        }

        const payload = {
            community_role: role,
            full_name: document.getElementById('regFullName').value.trim(),
            email: document.getElementById('regEmail').value.trim(),
            password: document.getElementById('regPassword').value,
            university_name: document.getElementById('regUniversity').value.trim(),
            id_card_number: document.getElementById('regIdNumber').value.trim(),
            avatar_url: document.getElementById('regAvatarUrl')?.value.trim() || ''
        };

        const submitBtn = document.getElementById('regSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Verifying & Joining...";
        }

        try {
            const res = await ApiService.register(payload);
            this.currentUser = res.user;
            showToast(`Welcome! Successfully registered to ${role.toUpperCase()} community!`, "success");
            this.updateUserWidgets();
            this.navigateToRoleHome(role);
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = `Complete ${role.charAt(0).toUpperCase() + role.slice(1)} Registration`;
            }
        }
    }

    async handleLoginSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        const submitBtn = document.getElementById('loginSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Signing in...";
        }

        try {
            const res = await ApiService.login(email, password);
            this.currentUser = res.user;
            showToast(res.message, "success");
            this.updateUserWidgets();
            this.navigateToRoleHome(res.user.community_role);
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Sign In";
            }
        }
    }

    signOut() {
        ApiService.clearAuth();
        this.currentUser = null;
        showToast("Signed out successfully.", "info");
        this.showView('joinCommunityView');
    }

    setOfferVehicleType(type) {
        this.offerVehicleType = type;

        const carOption = document.getElementById('transportOptionCar');
        const bikeOption = document.getElementById('transportOptionBike');
        const carRadio = document.getElementById('vehicleCarRadio');
        const bikeRadio = document.getElementById('vehicleBikeRadio');
        const seatsInput = document.getElementById('offerSeats');
        const seatsBadge = document.getElementById('bikeSeatsBadge');
        const seatsLabel = document.getElementById('offerSeatsLabel');
        const modelLabel = document.getElementById('offerVehicleModelLabel');
        const modelInput = document.getElementById('offerCarModel');
        const plateLabel = document.getElementById('offerVehiclePlateLabel');
        const plateInput = document.getElementById('offerCarPlate');
        const notesInput = document.getElementById('offerNotes');

        if (type === 'bike') {
            if (carOption) carOption.classList.remove('active');
            if (bikeOption) bikeOption.classList.add('active');
            if (bikeRadio) bikeRadio.checked = true;

            if (seatsInput) {
                seatsInput.value = 1;
                seatsInput.readOnly = true;
                seatsInput.style.backgroundColor = '#f8fafc';
                seatsInput.style.cursor = 'not-allowed';
            }
            if (seatsBadge) seatsBadge.style.display = 'inline-block';
            if (seatsLabel) seatsLabel.innerText = "Seats to Offer (Fixed: 1 Pillion Seat)";
            if (modelLabel) modelLabel.innerText = "Bike / Scooter Model";
            if (modelInput) modelInput.placeholder = "e.g. Royal Enfield, Activa, Pulsar";
            if (plateLabel) plateLabel.innerText = "Bike Plate Number";
            if (plateInput) plateInput.placeholder = "e.g. DL-08-BK-1234";
            if (notesInput) notesInput.placeholder = "e.g. Helmet provided for pillion passenger, leaving on time";
        } else {
            if (carOption) carOption.classList.add('active');
            if (bikeOption) bikeOption.classList.remove('active');
            if (carRadio) carRadio.checked = true;

            if (seatsInput) {
                if (seatsInput.value === '1') seatsInput.value = 3;
                seatsInput.readOnly = false;
                seatsInput.style.backgroundColor = '#ffffff';
                seatsInput.style.cursor = 'auto';
            }
            if (seatsBadge) seatsBadge.style.display = 'none';
            if (seatsLabel) seatsLabel.innerText = "Seats to Offer (1 to 6)";
            if (modelLabel) modelLabel.innerText = "Car Model";
            if (modelInput) modelInput.placeholder = "e.g. Honda City / Swift";
            if (plateLabel) plateLabel.innerText = "Car Plate Number";
            if (plateInput) plateInput.placeholder = "e.g. DL-08-AB-1234";
            if (notesInput) notesInput.placeholder = "e.g. Leaving from library gate, AC on";
        }
    }

    openOfferRideModal(prefillOrigin, prefillDest) {
        const modal = document.getElementById('offerRideModal');
        if (!modal) return;

        // Reset or apply vehicle type
        this.setOfferVehicleType(this.offerVehicleType || 'car');

        const originInput = document.getElementById('offerOrigin');
        const destInput = document.getElementById('offerDest');

        if (originInput && prefillOrigin) originInput.value = prefillOrigin;
        else if (originInput && this.pickupLocationText) originInput.value = this.pickupLocationText;

        if (destInput && prefillDest) destInput.value = prefillDest;
        else if (destInput && this.destinationLocationText) destInput.value = this.destinationLocationText;

        // Auto-populate upcoming datetime in calendar picker
        const timeInput = document.getElementById('offerTime');
        if (timeInput) {
            const now = new Date();
            now.setHours(now.getHours() + 1);
            now.setMinutes(0);

            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const mins = String(now.getMinutes()).padStart(2, '0');
            const formatted = `${year}-${month}-${day}T${hours}:${mins}`;

            timeInput.min = new Date().toISOString().slice(0, 16);
            if (!timeInput.value) {
                timeInput.value = formatted;
            }
        }

        modal.classList.add('active');
    }

    async handleOfferRideSubmit(e) {
        e.preventDefault();
        if (!this.currentUser) return;

        const vehicleType = this.offerVehicleType || 'car';
        const totalSeats = vehicleType === 'bike' ? 1 : parseInt(document.getElementById('offerSeats').value, 10);

        const payload = {
            community_role: this.currentUser.community_role,
            vehicle_type: vehicleType,
            origin: document.getElementById('offerOrigin').value.trim(),
            destination: document.getElementById('offerDest').value.trim(),
            departure_time: this.formatDateTime(document.getElementById('offerTime').value),
            total_seats: totalSeats,
            price_per_seat: parseFloat(document.getElementById('offerPrice').value),
            car_model: document.getElementById('offerCarModel').value.trim(),
            car_plate: document.getElementById('offerCarPlate').value.trim(),
            notes: document.getElementById('offerNotes').value.trim()
        };

        const submitBtn = document.getElementById('offerRideSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Publishing...";
        }

        try {
            const res = await ApiService.createRide(payload);
            this.closeModals();
            showToast(res.message, "success");
            document.getElementById('offerRideForm').reset();
            // Automatically refresh and show matching rides
            this.handleFindRide();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Publish Ride";
            }
        }
    }

    openBookingModal(rideId) {
        const ride = this.ridesList.find(r => r.id === rideId);
        if (!ride) return;

        this.selectedRideForBooking = ride;

        const isBike = ride.vehicle_type === 'bike';

        document.getElementById('bookingModalOrigin').innerText = ride.origin;
        document.getElementById('bookingModalDest').innerText = ride.destination;
        document.getElementById('bookingModalDriver').innerText = ride.driver_name;
        document.getElementById('bookingModalTime').innerText = ride.departure_time;
        document.getElementById('bookingModalPrice').innerText = `₹${Math.round(ride.price_per_seat)}`;

        // Vehicle badge and details in booking modal
        const vehicleBadge = document.getElementById('bookingModalVehicleBadge');
        if (vehicleBadge) {
            vehicleBadge.className = `vehicle-pill ${isBike ? 'bike' : 'car'}`;
            vehicleBadge.innerText = isBike ? '🛵 2-Wheeler (Bike)' : '🚗 4-Wheeler (Car)';
        }

        const vehicleText = document.getElementById('bookingModalVehicle');
        if (vehicleText) {
            vehicleText.innerText = `${isBike ? '🛵 Bike' : '🚗 Car'}: ${ride.car_model || (isBike ? 'Bike' : 'Car')} (${ride.car_plate || 'Verified'})`;
        }

        const notice = document.getElementById('bikeBookingNotice');
        if (notice) notice.style.display = isBike ? 'block' : 'none';

        const badgeEl = document.getElementById('bookingModalRoleBadge');
        if (badgeEl) {
            badgeEl.className = `role-badge ${ride.community_role}`;
            badgeEl.innerText = `${ride.community_role.toUpperCase()} COMMUNITY`;
        }

        // Seats selection - Bike is strictly 1 seat, Car is 1 to available_seats
        const seatSelect = document.getElementById('bookingSeatsSelect');
        seatSelect.innerHTML = '';
        const maxSeats = isBike ? 1 : Math.min(ride.available_seats, 4);
        for (let i = 1; i <= maxSeats; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = `${i} seat (${i * ride.price_per_seat} INR)`;
            seatSelect.appendChild(opt);
        }

        const modal = document.getElementById('bookingModal');
        if (modal) modal.classList.add('active');
    }


    async handleBookingConfirmation() {
        if (!this.selectedRideForBooking) return;
        const ride = this.selectedRideForBooking;
        const seats = parseInt(document.getElementById('bookingSeatsSelect').value, 10);

        const confirmBtn = document.getElementById('confirmBookingBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerText = "Validating Community Policy...";
        }

        try {
            const res = await ApiService.bookRide(ride.id, {
                seats_booked: seats,
                booking_note: "Booked via Live Map Interface"
            });

            this.closeModals();
            showToast("Ride successfully booked within your community!", "success");
            this.closeMatchingRidesSheet();
            this.loadUserBookings();
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerText = "Confirm Booking";
            }
        }
    }

    async openMyBookingsModal() {
        const modal = document.getElementById('myBookingsModal');
        const container = document.getElementById('modalBookingsList');
        if (!container) return;

        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Loading your bookings...</div>`;
        if (modal) modal.classList.add('active');

        try {
            const data = await ApiService.getBookings();
            const bookings = data.passenger_bookings || [];

            if (bookings.length === 0) {
                container.innerHTML = `
                    <div style="background: var(--bg-card-alt); border-radius: var(--radius-md); padding: 24px; text-align: center; color: var(--text-muted);">
                        No upcoming ride bookings found. Search available rides on the map to carpool!
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            bookings.forEach(b => {
                const div = document.createElement('div');
                div.style.cssText = "background: #ffffff; border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;";
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${b.driver_avatar}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1.5px solid #d4c3aa;">
                        <div>
                            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${b.origin} → ${b.destination}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                                Driver: <strong>${b.driver_name}</strong> • ${b.departure_time} • ${b.seats_booked} seat(s)
                            </div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span class="role-badge ${b.community_role}" style="font-size: 0.72rem;">${b.community_role}</span>
                        <div style="font-size: 0.82rem; font-weight: 700; color: #047857; margin-top: 4px;">Confirmed</div>
                    </div>
                `;
                container.appendChild(div);
            });

        } catch (e) {
            container.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 20px;">Failed to load bookings: ${e.message}</div>`;
        }
    }

    async loadUserBookings() {
        if (!this.currentUser) return;
        try {
            const data = await ApiService.getBookings();
            this.bookings = data;
        } catch (e) {
            // Non-blocking
        }
    }

    formatDateTime(val) {
        if (!val) return 'Today, Upcoming departure';
        const date = new Date(val);
        if (isNaN(date.getTime())) return val;

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 1);
        const isTomorrow = date.toDateString() === tomorrow.toDateString();

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (isToday) {
            return `Today, ${timeStr}`;
        } else if (isTomorrow) {
            return `Tomorrow, ${timeStr}`;
        } else {
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            return `${dateStr}, ${timeStr}`;
        }
    }

    closeModals() {
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // =========================================================================
    // 8. EVENT BINDINGS
    // =========================================================================

    bindEvents() {
        // Recenter button
        const recenterBtn = document.getElementById('recenterLocationBtn');
        if (recenterBtn) {
            recenterBtn.addEventListener('click', () => this.recenterMap());
        }

        // Map Zoom In / Out
        const zoomInBtn = document.getElementById('mapZoomInBtn');
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => { if (this.map) this.map.zoomIn(); });

        const zoomOutBtn = document.getElementById('mapZoomOutBtn');
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { if (this.map) this.map.zoomOut(); });

        // GPS detect button
        const detectGpsBtn = document.getElementById('detectGpsBtn');
        if (detectGpsBtn) detectGpsBtn.addEventListener('click', () => this.detectUserLocation());

        // Destination input typing
        const destInput = document.getElementById('destinationLocationInput');
        if (destInput) {
            destInput.addEventListener('input', (e) => this.handleDestinationInput(e.target.value));
            destInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.handleFindRide();
                }
            });
        }

        // Clear destination button
        const clearDestBtn = document.getElementById('clearDestBtn');
        if (clearDestBtn) {
            clearDestBtn.addEventListener('click', () => this.clearDestination());
        }

        // Quick destination chips
        document.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dest = btn.getAttribute('data-dest');
                const lat = parseFloat(btn.getAttribute('data-lat'));
                const lng = parseFloat(btn.getAttribute('data-lng'));
                this.setDestinationCoords(lat, lng, dest);
            });
        });

        // "Find a Ride" button
        const findRideBtn = document.getElementById('findRideBtn');
        if (findRideBtn) {
            findRideBtn.addEventListener('click', () => this.handleFindRide());
        }

        // Registration Category Card Selection
        document.querySelectorAll('.role-card').forEach(card => {
            card.addEventListener('click', () => {
                const role = card.getAttribute('data-community-role');
                this.selectRegistrationCategory(role);
            });
        });

        document.querySelectorAll('.role-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const role = btn.getAttribute('data-role');
                this.selectRegistrationCategory(role);
            });
        });

        // Registration & Login Forms
        const regForm = document.getElementById('communityRegistrationForm');
        if (regForm) regForm.addEventListener('submit', (e) => this.handleRegistrationSubmit(e));

        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));

        // Offer Ride Form
        const offerRideForm = document.getElementById('offerRideForm');
        if (offerRideForm) offerRideForm.addEventListener('submit', (e) => this.handleOfferRideSubmit(e));

        // Booking confirmation
        const confirmBookingBtn = document.getElementById('confirmBookingBtn');
        if (confirmBookingBtn) confirmBookingBtn.addEventListener('click', () => this.handleBookingConfirmation());

        // Modal close buttons
        document.querySelectorAll('.modal-close-trigger').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModals();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('destinationSuggestions');
            const destGroup = document.querySelector('.destination-group');
            if (dropdown && destGroup && !destGroup.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
    window.app = new CollegeChaloApp();
});
