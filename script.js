// JGD2011 to WGS84 Converter Logic
// Constants for 19 Coordinate Systems
const ORIGINS = [
    null, // 0 index holder
    { lat: 33.0000, lon: 129.5000 }, // 1
    { lat: 33.0000, lon: 131.0000 }, // 2
    { lat: 36.0000, lon: 132.16666666666666 }, // 3
    { lat: 33.0000, lon: 133.5000 }, // 4
    { lat: 36.0000, lon: 134.33333333333334 }, // 5
    { lat: 36.0000, lon: 136.0000 }, // 6
    { lat: 36.0000, lon: 137.16666666666666 }, // 7
    { lat: 36.0000, lon: 138.5000 }, // 8
    { lat: 36.0000, lon: 139.83333333333334 }, // 9 (Tokyo)
    { lat: 40.0000, lon: 140.83333333333334 }, // 10
    { lat: 44.0000, lon: 140.2500 }, // 11
    { lat: 44.0000, lon: 142.2500 }, // 12
    { lat: 44.0000, lon: 144.2500 }, // 13
    { lat: 26.0000, lon: 142.0000 }, // 14
    { lat: 26.0000, lon: 127.5000 }, // 15
    { lat: 26.0000, lon: 124.0000 }, // 16
    { lat: 26.0000, lon: 131.0000 }, // 17
    { lat: 20.0000, lon: 136.0000 }, // 18
    { lat: 26.0000, lon: 154.0000 }  // 19
];

// GRS80 Ellipsoid Parameters
const a = 6378137.0;
const F_inv = 298.257222101;
const n = 1.0 / (2 * F_inv - 1);
const m0 = 0.9999;

// Parameters for Kawase Formula
// A_j coefficients
const A0 = 1 + (n ** 2) / 4 + (n ** 4) / 64;
const A1 = - (3 / 2) * (n - (n ** 3) / 8 - (n ** 5) / 64);
const A2 = (15 / 16) * (n ** 2 - (n ** 4) / 4);
const A3 = - (35 / 48) * (n ** 3 - (5 / 16) * (n ** 5));
const A4 = (315 / 512) * (n ** 4);
const A5 = - (693 / 1280) * (n ** 5);

// Beta coefficients (Rectifying -> Transverse)
const B1 = (1 / 2) * n - (2 / 3) * (n ** 2) + (37 / 96) * (n ** 3) - (1 / 360) * (n ** 4) - (81 / 512) * (n ** 5);
const B2 = (1 / 48) * (n ** 2) + (1 / 15) * (n ** 3) - (437 / 1440) * (n ** 4) + (46 / 105) * (n ** 5);
const B3 = (17 / 480) * (n ** 3) - (37 / 840) * (n ** 4) - (209 / 4480) * (n ** 5);
const B4 = (4397 / 161280) * (n ** 4) - (11 / 504) * (n ** 5);
const B5 = (4583 / 161280) * (n ** 5);

// Delta coefficients (Conformal -> Geographic via t_psi)
const D1 = -(2 / 3) * (n ** 2) - (2 / 3) * (n ** 3) + (4 / 9) * (n ** 4) + (2 / 9) * (n ** 5);
const D2 = (1 / 3) * (n ** 2) - (4 / 15) * (n ** 3) - (23 / 45) * (n ** 4) + (68 / 45) * (n ** 5);
const D3 = (2 / 5) * (n ** 3) - (24 / 35) * (n ** 4) - (46 / 35) * (n ** 5);
const D4 = (83 / 126) * (n ** 4) - (80 / 63) * (n ** 5);
const D5 = (52 / 45) * (n ** 5);

// A_bar and constants
const A_bar = (m0 * a) / (1 + n) * A0;
const S_const = (m0 * a) / (1 + n);

// Helpers
function sinh(x) { return Math.sinh(x); }
function cosh(x) { return Math.cosh(x); }
function tanh(x) { return Math.tanh(x); }

// UI Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const mapContainer = document.getElementById('map');
let map = null;
let currentMarker = null;

function convertToLatLon(sysNum, x, y) {
    const origin = ORIGINS[sysNum];
    if (!origin) return null;

    const phi0 = origin.lat * Math.PI / 180.0;
    const lambda0 = origin.lon * Math.PI / 180.0;

    // Calculate S_phi0 (Meridian arc at origin)
    const S_phi0 = S_const * (
        A0 * phi0 +
        A1 * Math.sin(2 * phi0) +
        A2 * Math.sin(4 * phi0) +
        A3 * Math.sin(6 * phi0) +
        A4 * Math.sin(8 * phi0) +
        A5 * Math.sin(10 * phi0)
    );

    // 1. Calculate xi, eta
    const xi = (x + S_phi0) / A_bar;
    const eta = y / A_bar;

    // 2. Calculate xi', eta' (Transverse -> Conformal)
    // Formula: xi' = xi - sum(Bj * sin(2j*xi) * cosh(2j*eta))
    //          eta' = eta - sum(Bj * cos(2j*xi) * sinh(2j*eta))
    let sum_xi = 0;
    let sum_eta = 0;

    // Array of betas 1-5
    const betas = [0, B1, B2, B3, B4, B5];

    for (let j = 1; j <= 5; j++) {
        sum_xi += betas[j] * Math.sin(2 * j * xi) * cosh(2 * j * eta);
        sum_eta += betas[j] * Math.cos(2 * j * xi) * sinh(2 * j * eta);
    }

    const xi_prime = xi - sum_xi;
    const eta_prime = eta - sum_eta;

    // 3. Conformal Latitude chi
    const chi = Math.asin(Math.sin(xi_prime) / cosh(eta_prime));

    // 4. Calculate Latitude phi
    // t_psi calculation
    let sum_delta = 0;
    const deltas = [0, D1, D2, D3, D4, D5];

    for (let j = 1; j <= 5; j++) {
        sum_delta += deltas[j] * Math.sin(2 * j * chi);
    }

    const t_psi = ((1 + n) / (1 - n)) * Math.tan(chi + sum_delta);
    const phi = Math.atan(((1 + n) / (1 - n)) * t_psi);

    // 5. Calculate Longitude lambda
    const lambda = lambda0 + Math.atan(sinh(eta_prime) / Math.cos(xi_prime));

    return {
        lat: phi * 180 / Math.PI,
        lon: lambda * 180 / Math.PI
    };
}

// Convert Decimal Degrees to DMS (Sexagesimal)
function toDMS(deg) {
    const d = Math.floor(deg);
    const m = Math.floor((deg - d) * 60);
    const s = ((deg - d) * 60 - m) * 60;
    return `${d}°${m}'${s.toFixed(5)}"`;
}

// Geoid Handling
let isgGrid = null;
let ascGrid = null;
let currentGeoidModel = 'JPGEO2024';

async function calculateGeoidHeight(lat, lon) {
    const modelSelect = document.getElementById('geoid-select');
    const selectedModel = modelSelect ? modelSelect.value : 'JPGEO2024';

    // Ensure data is loaded
    if (selectedModel !== currentGeoidModel || (selectedModel === 'JPGEO2024' && !isgGrid) || (selectedModel === 'GSIGEO2011' && !ascGrid)) {
        await loadGeoidData(selectedModel);
    }

    if (selectedModel === 'GSIGEO2011') {
        return getGeoidFromASC(lat, lon);
    } else {
        return getGeoidFromISG(lat, lon);
    }
}

async function loadGeoidData(model = 'JPGEO2024') {
    const statusEl = document.getElementById('isg-status');
    const filename = model === 'GSIGEO2011' ? 'gsigeo2011_ver2_2.asc' : 'JPGEO2024.isg';

    // Prevent reload if already loaded
    if (model === 'GSIGEO2011' && ascGrid) {
        currentGeoidModel = model;
        statusEl.textContent = `読み込み完了 (${model})`;
        statusEl.style.color = "#10b981";
        return true;
    }
    if (model === 'JPGEO2024' && isgGrid) {
        currentGeoidModel = model;
        statusEl.textContent = `読み込み完了 (${model})`;
        statusEl.style.color = "#10b981";
        return true;
    }

    statusEl.textContent = `読み込み中 (${filename})...`;
    statusEl.style.color = "#fbbf24";

    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error("Network response was not ok");
        const text = await response.text();

        let success = false;
        if (model === 'GSIGEO2011') {
            success = parseASC(text);
        } else {
            success = parseISG(text);
        }

        if (success) {
            statusEl.textContent = `読み込み完了 (${model})`;
            statusEl.style.color = "#10b981";
            currentGeoidModel = model;
            return true;
        }
    } catch (error) {
        console.error("Geoid Load Error:", error);
        statusEl.textContent = `読み込み失敗 (${filename})`;
        statusEl.style.color = "#ef4444";
        return false;
    }
    return false;
}

// ISG Parser (ISG 2.0)
// ISG Parser (ISG 2.0)
function parseISG(text) {
    try {
        const lines = text.split(/\r?\n/);
        const header = {};
        let dataStartIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('end_of_head')) {
                dataStartIndex = i + 1;
                break;
            }

            // Handle both "key : value" and "key = value"
            if (line.includes(':') || line.includes('=')) {
                const sepIndex = line.search(/[:=]/);
                if (sepIndex !== -1) {
                    const key = line.substring(0, sepIndex).trim();
                    const val = line.substring(sepIndex + 1).trim();
                    header[key] = val;
                }
            }
        }

        const parseVal = (key) => {
            const val = header[key];
            if (!val) return null;
            const dms = val.match(/(\d+)°(\d+)'([\d.]+)"/);
            if (dms) {
                return parseInt(dms[1]) + parseInt(dms[2]) / 60 + parseFloat(dms[3]) / 3600;
            }
            return parseFloat(val);
        };

        const latMin = parseVal('lat min');
        const latMax = parseVal('lat max');
        const lonMin = parseVal('lon min');
        const lonMax = parseVal('lon max');
        const dLat = parseVal('delta lat');
        const dLon = parseVal('delta lon');
        const nrows = parseInt(header['nrows']);
        const ncols = parseInt(header['ncols']);
        const nodata = parseFloat(header['nodata']);

        const gridData = [];
        const bodyText = lines.slice(dataStartIndex).join(' ');
        const parts = bodyText.trim().split(/\s+/);

        for (let j = 0; j < parts.length; j++) {
            if (parts[j] !== "") gridData.push(parseFloat(parts[j]));
        }

        isgGrid = {
            latMin, latMax, lonMin, lonMax, dLat, dLon,
            data: gridData,
            cols: ncols,
            rows: nrows,
            nodata: nodata,
            isNorthUp: true
        };

        console.log("ISG Loaded:", { nrows, ncols, size: gridData.length });
        document.getElementById('isg-status').textContent = "読み込み完了 (v2.0)";
        document.getElementById('isg-status').style.color = "#10b981";
        return true;

    } catch (e) {
        console.error("ISG Parse Error:", e);
        alert("ISGファイルの解析に失敗しました");
        return false;
    }
}

function getGeoidFromISG(lat, lon) {
    if (!isgGrid) return null;
    const g = isgGrid;

    // Check bounds
    if (lat < g.latMin || lat > g.latMax || lon < g.lonMin || lon > g.lonMax) return "範囲外";

    // Indices (Assuming North to South for Rows, West to East for Cous)
    let row, col;

    if (g.isNorthUp) {
        row = (g.latMax - lat) / g.dLat;
    } else {
        row = (lat - g.latMin) / g.dLat;
    }
    col = (lon - g.lonMin) / g.dLon;

    const r0 = Math.floor(row);
    const r1 = r0 + 1;
    const c0 = Math.floor(col);
    const c1 = c0 + 1;

    // Bounds check for safety
    if (r0 < 0 || r1 >= g.rows || c0 < 0 || c1 >= g.cols) return "範囲外 (Index)";

    // Bilinear Interpolation
    const v00 = g.data[r0 * g.cols + c0];
    const v01 = g.data[r0 * g.cols + c1];
    const v10 = g.data[r1 * g.cols + c0];
    const v11 = g.data[r1 * g.cols + c1];

    if (v00 === g.nodata || v01 === g.nodata || v10 === g.nodata || v11 === g.nodata) return "データなし";

    // Weights
    const t = row - r0; // Vertical weight (0 at r0, 1 at r1)
    const u = col - c0; // Horizontal weight (0 at c0, 1 at c1)

    // Interpolate
    // Row r0 (Top if NorthUp)
    const h_row0 = (1 - u) * v00 + u * v01;
    // Row r1 (Bottom if NorthUp)
    const h_row1 = (1 - u) * v10 + u * v11;

    // Interpolate vertically
    const h = (1 - t) * h_row0 + t * h_row1;

    return h.toFixed(3) + " m";
}

// Parse GSIGEO2011 ASC Format
function parseASC(text) {
    try {
        const lines = text.trim().split(/\r?\n/);
        // Header: 20.00000 120.00000 0.016667 0.025000 1801 1201 1 ver2.2
        const headerParts = lines[0].trim().split(/\s+/);
        if (headerParts.length < 6) throw new Error("Invalid ASC Header");

        const minLat = parseFloat(headerParts[0]); // 20.0
        const minLon = parseFloat(headerParts[1]); // 120.0
        const dLat = parseFloat(headerParts[2]);
        const dLon = parseFloat(headerParts[3]);
        const nLat = parseInt(headerParts[4]); // 1801 Rows
        const nLon = parseInt(headerParts[5]); // 1201 Cols

        // Data Start
        const gridData = new Float32Array(nLat * nLon);
        let dataIndex = 0;

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const rowStr = lines[i].trim();
            if (!rowStr) continue;
            const nums = rowStr.split(/\s+/);
            for (let j = 0; j < nums.length; j++) {
                gridData[dataIndex++] = parseFloat(nums[j]);
            }
        }

        ascGrid = {
            minLat, minLon, dLat, dLon, nLat, nLon,
            maxLat: minLat + (nLat - 1) * dLat,
            maxLon: minLon + (nLon - 1) * dLon,
            data: gridData,
            nodata: 999.0
        };

        console.log("GSIGEO2011 Loaded:", { nLat, nLon, size: dataIndex });
        return true;
    } catch (e) {
        console.error("ASC Parse Error:", e);
        return false;
    }
}

function getGeoidFromASC(lat, lon) {
    if (!ascGrid) return null;
    const g = ascGrid;

    if (lat < g.minLat || lat > g.maxLat || lon < g.minLon || lon > g.maxLon) return "範囲外";

    // Indices (South to North, West to East)
    const row = (lat - g.minLat) / g.dLat;
    const col = (lon - g.minLon) / g.dLon;

    const r0 = Math.floor(row);
    const r1 = r0 + 1;
    const c0 = Math.floor(col);
    const c1 = c0 + 1;

    // Check boundary
    if (r1 >= g.nLat || c1 >= g.nLon) return "範囲外";

    // In S-to-N array: Index = r * nLon + c
    // v00 = (r0, c0) = (LowLat, LowLon) = SW (South-West)
    // v01 = (r0, c1) = (LowLat, HighLon) = SE (South-East)
    // v10 = (r1, c0) = (HighLat, LowLon) = NW (North-West)
    // v11 = (r1, c1) = (HighLat, HighLon) = NE (North-East)

    const v00 = g.data[r0 * g.nLon + c0];
    const v01 = g.data[r0 * g.nLon + c1];
    const v10 = g.data[r1 * g.nLon + c0];
    const v11 = g.data[r1 * g.nLon + c1];

    if (v00 >= 990 || v01 >= 990 || v10 >= 990 || v11 >= 990) return "データなし";

    // Bilinear Interpolation
    // t (Phi direction): 0 at r0 (South), 1 at r1 (North)
    // u (Lambda direction): 0 at c0 (West), 1 at c1 (East)
    const t = row - r0;
    const u = col - c0;

    const h = (1 - t) * (1 - u) * v00 +
        (1 - t) * u * v01 +
        t * (1 - u) * v10 +
        t * u * v11;

    return h.toFixed(3) + " m";
}


// UI Initialization


// Manual Conversion (Named function)
async function convert() {
    const sys = parseInt(document.getElementById('system-select').value);
    const x = parseFloat(document.getElementById('input-x').value);
    const y = parseFloat(document.getElementById('input-y').value);

    if (isNaN(x) || isNaN(y)) {
        alert('座標を正しく入力してください');
        return;
    }

    const result = convertToLatLon(sys, x, y);
    if (result) {
        document.getElementById('result-area').classList.remove('hidden');
        document.getElementById('res-lat').textContent = result.lat.toFixed(8);
        document.getElementById('res-lon').textContent = result.lon.toFixed(8);
        document.getElementById('res-lat-dms').textContent = toDMS(result.lat);
        document.getElementById('res-lon-dms').textContent = toDMS(result.lon);

        const mapLink = document.getElementById('gsi-map-link');
        if (mapLink) {
            mapLink.href = `https://maps.gsi.go.jp/#15/${result.lat}/${result.lon}/`;
        }

        // Update Leaflet Map
        if (map) {
            if (currentMarker) map.removeLayer(currentMarker);
            map.setView([result.lat, result.lon], 15);
            currentMarker = L.marker([result.lat, result.lon]).addTo(map)
                .bindPopup(`緯度: ${result.lat.toFixed(5)}<br>経度: ${result.lon.toFixed(5)}`)
                .openPopup();
            // Delay to ensure container is visible
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }

        // Geoid Calculation
        const geoidVal = await calculateGeoidHeight(result.lat, result.lon);

        const geoidEl = document.getElementById('res-geoid');
        if (geoidEl) {
            geoidEl.textContent = geoidVal;
        }
    }
}

function init() {
    // Auto-load default geoid (JPGEO2024)
    loadGeoidData('JPGEO2024');

    // Initialize Map
    if (document.getElementById('map')) {
        map = L.map('map').setView([35.681236, 139.767125], 5);
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
        }).addTo(map);
    }

    document.getElementById('convert-btn').addEventListener('click', convert);

    // Geoid Switch Listener
    document.getElementById('geoid-select').addEventListener('change', (e) => {
        loadGeoidData(e.target.value);
    });

    // Manual ISG File Input
    const isgInput = document.getElementById('isg-file');
    if (isgInput) {
        isgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                parseISG(ev.target.result);
            };
            reader.readAsText(file);
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');

            // Refresh map if switching to manual tab
            if (btn.dataset.tab === 'manual' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });

    // CSV Handling
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#3b82f6';
            dropZone.style.background = 'rgba(59, 130, 246, 0.1)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'rgba(255,255,255,0.1)';
            dropZone.style.background = 'transparent';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(255,255,255,0.1)';
            dropZone.style.background = 'transparent';
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });
    }

    let csvData = [];

    function handleFile(file) {
        document.querySelector('#drop-zone p').textContent = file.name;
        document.getElementById('csv-convert-btn').disabled = false;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r\n|\n/).filter(l => l.trim());
            csvData = lines.map(line => {
                const parts = line.split(',');
                if (parts.length >= 3) {
                    return { name: parts[0], x: parseFloat(parts[1]), y: parseFloat(parts[2]) };
                }
                return null;
            }).filter(d => d && !isNaN(d.x) && !isNaN(d.y));
        };
        reader.readAsText(file);
    }

    const csvBtn = document.getElementById('csv-convert-btn');
    if (csvBtn) {
        csvBtn.addEventListener('click', async () => {
            const sys = parseInt(document.getElementById('system-select').value);
            const tbody = document.querySelector('#result-table tbody');
            tbody.innerHTML = '';
            document.getElementById('csv-results-container').classList.remove('hidden');
            const kmlBtn = document.getElementById('download-kml');
            if (kmlBtn) kmlBtn.disabled = false;

            for (let i = 0; i < csvData.length; i++) {
                const item = csvData[i];
                const res = convertToLatLon(sys, item.x, item.y);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.name}</td>
                    <td>${res.lat.toFixed(8)}</td>
                    <td>${res.lon.toFixed(8)}</td>
                    <td>${toDMS(res.lat)}</td>
                    <td>${toDMS(res.lon)}</td>
                    <td id="geoid-${i}">...</td>
                `;
                tbody.appendChild(tr);

                const geoidVal = await calculateGeoidHeight(res.lat, res.lon);
                document.getElementById(`geoid-${i}`).textContent = geoidVal;
            }
        });
    }

    // KML Download
    const kmlBtn = document.getElementById('download-kml');
    if (kmlBtn) {
        kmlBtn.addEventListener('click', () => {
            if (csvData.length === 0) return;
            const sys = parseInt(document.getElementById('system-select').value);
            let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>JGD2011 Conversion Results</name>
`;
            csvData.forEach(item => {
                const res = convertToLatLon(sys, item.x, item.y);
                kml += `    <Placemark>
      <name>${item.name}</name>
      <Point>
        <coordinates>${res.lon},${res.lat},0</coordinates>
      </Point>
    </Placemark>
`;
            });
            kml += `  </Document>
</kml>`;
            const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'results.kml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered (Scope: ' + reg.scope + ')'))
            .catch(err => console.log('Service Worker Registration Failed:', err));
    });
}

// Start App
init();
