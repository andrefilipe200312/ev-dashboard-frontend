import React, { useEffect, useState } from 'react';
import './App.css';

// --- IMPORTS DO MAPA (LEAFLET) ---
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Correção para os ícones dos marcadores do Leaflet em React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// --- IMPORTS DE ÍCONES E GRÁFICOS ---
import {
  Battery, TrendingUp, Database, Activity, Clock, AlertCircle,
  Zap, BarChart3, Home, FileText, Menu, X, ChevronRight,
  Sparkles, DollarSign, Thermometer, Map as MapIcon 
} from 'lucide-react';
import {
  LineChart, Line, ScatterChart, Scatter, Cell, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend, BarChart as BarChartR, Bar,
  AreaChart, Area, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

// --- Configuração do Ícone do Mapa (Fix do Leaflet) ---
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_BASE_URL = 'http://localhost:5000';
const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function App() {
  const [latestData, setLatestData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [clustersData, setClustersData] = useState([]);
  const [stationsData, setStationsData] = useState([]); // --- NOVO: Estado para estações ---
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [centroidsData, setCentroidsData] = useState([]);

  const fetchData = async () => {
    try {
      if (!latestData) setLoading(true);
      setError(null);

      // --- ATUALIZADO: Adicionado fetch para /api/stations ---
      const [latestRes, historyRes, clustersRes, stationsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/latest`).catch(err => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/history`).catch(err => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/clusters`).catch(err => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/stations`).catch(err => ({ ok: false }))
      ]);

      let fetchedHistory = [];

      // 1. Processa Latest Data
      if (latestRes.ok) {
        const latest = await latestRes.json();
        setLatestData(latest);
      }

      // 2. Processa Stations Data (NOVO)
      if (stationsRes.ok) {
        const stations = await stationsRes.json();
        setStationsData(stations);
      }

      // 3. Processa History Data
      if (historyRes.ok) {
        const rawHistory = await historyRes.json();
        
        fetchedHistory = rawHistory.map((item) => {
            const rawDate = item.charging_start_time || item.timestamp || new Date().toISOString();
            const dateObj = new Date(rawDate);
            
            return {
              ...item,
              timestamp_obj: dateObj,
              timestamp_formatted: isNaN(dateObj) 
                ? 'Hora Inválida' 
                : dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
              
              temperatura: parseFloat(item.temperature_c) || 0,
              energia: parseFloat(item.energy_consumed_kwh) || 0,
              charging_rate: parseFloat(item.charging_rate_kw) || 0,
              charging_cost: parseFloat(item.charging_cost_eur) || 0,
              id_str: String(item.id),

              // --- CORREÇÃO AQUI ---
              // 1. Mapeamos a coluna da BD 'vehicle_age_years' para 'idade'
              percentagem: parseFloat(item.state_of_charge_start_percent) || 0, 

              // 2. Mapeamos a duração para 'tempo'
              distancia: parseFloat(item.distance_driven_since_last_charge_km|| 0)
            };
          })
          .filter(item => {
            // Filtro 1: Ignorar distâncias negativas ou zero (erros de leitura)
            const validDistance = item.distancia > 0;

            // Filtro 2: Ignorar bateria inicial inválida (ex: > 100%)
            // SE QUISERES SÓ VER CARROS ABAIXO DE 10%, MUDA 100 PARA 10 AQUI:
            const validBattery = item.percentagem >= 0 && item.percentagem <= 100; 

            return validDistance && validBattery;
         })
          .sort((a, b) => a.timestamp_obj - b.timestamp_obj);

        setHistoryData(fetchedHistory);
      }

      // 4. Processa Clusters e Faz o Merge
       // 4. Processa Clusters e Centroides
      if (clustersRes.ok) {
        const fetchedClusters = await clustersRes.json();
        setClustersData(fetchedClusters);

        // --- Centroides ---
      if (fetchedClusters.centroids) {
        const centroids = fetchedClusters.centroids.map((c, idx) => ({
          percentagem: parseFloat(String(c[0]).replace(',', '.')),
          distancia: parseFloat(String(c[1]).replace(',', '.')),
          cluster: idx
        }));
        setCentroidsData(centroids);
      }

      // --- Merge direto usando fetchedClusters.points ---
      if (fetchedClusters.points) {
        const merged = fetchedClusters.points.map(p => ({
          percentagem: p.soc,
          distancia: p.dist,
          cluster: p.cluster
        }));
        setMergedData(merged);
      }
    }

      setLastUpdate(new Date());
      setLoading(false);
    } catch (err) {
      console.error("Erro no fetch:", err);
      setError('Erro de conexão com a API');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // --- Cálculos Estatísticos ---
  const clusterStats = mergedData.reduce((acc, item) => {
    const cluster = item.cluster;
    if (!acc[cluster]) acc[cluster] = { count: 0, avgTemp: 0, avgEnergy: 0, totalTemp: 0, totalEnergy: 0 };
    acc[cluster].count++;
    acc[cluster].totalTemp += item.temperatura;
    acc[cluster].totalEnergy += item.energia;
    return acc;
  }, {});

  Object.keys(clusterStats).forEach(key => {
    clusterStats[key].avgTemp = (clusterStats[key].totalTemp / clusterStats[key].count).toFixed(1);
    clusterStats[key].avgEnergy = (clusterStats[key].totalEnergy / clusterStats[key].count).toFixed(2);
  });

  const clusterStatsArray = Object.entries(clusterStats).map(([cluster, stats]) => ({
    cluster: `Cluster ${cluster}`,
    clusterNum: parseInt(cluster),
    count: stats.count,
    avgTemp: parseFloat(stats.avgTemp),
    avgEnergy: parseFloat(stats.avgEnergy)
  }));

  const totalCost = historyData.reduce((sum, item) => sum + item.charging_cost, 0);
  const avgDuration = historyData.length > 0 
    ? (historyData.reduce((sum, item) => sum + item.charging_duration, 0) / historyData.length).toFixed(2) 
    : 0;

  const costDistribution = historyData.length > 0 
    ? historyData.slice(-5).map((item, idx) => ({ name: `Sessão ${idx + 1}`, value: item.charging_cost }))
    : [{ name: 'Sem dados', value: 1 }];

  const performanceData = clusterStatsArray.length > 0
    ? clusterStatsArray.slice(0, 5).map(item => ({ subject: item.cluster, A: item.avgTemp, B: item.avgEnergy * 10, fullMark: 100 }))
    : [{ subject: 'N/A', A: 0, B: 0, fullMark: 100 }];

  // --- Renderização do Menu ---
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'clusters', label: 'Clusters', icon: Activity },
    { id: 'map', label: 'Localização', icon: MapIcon }, 
    { id: 'history', label: 'Histórico', icon: FileText },
  ];

  if (loading && !latestData) {
    return (
      <div className="loading-screen">
        <div>
          <div className="spinner">
            <Sparkles className="loading-icon" />
          </div>
          <p className="loading-title">A carregar dashboard...</p>
          <p className="loading-subtitle">A sincronizar dados em tempo real</p>
        </div>
      </div>
    );}
  

  return (
    <div className="bg-gradient-dashboard">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo"><div className="logo-bg-gradient"><Zap size={24} /></div></div>
          {sidebarOpen && <h2 className="sidebar-title" style={{marginLeft:'10px'}}>EV Charge</h2>}
        </div>
        <nav className="sidebar-menu">
          {menuItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`menu-button ${activeTab === item.id ? 'menu-button-active' : 'menu-button-inactive'}`}>
              <item.icon size={20} className="menu-icon"/>
              {sidebarOpen && <span>{item.label}</span>}
              {sidebarOpen && activeTab === item.id && <ChevronRight size={16} style={{marginLeft:'auto'}}/>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="sidebar-toggle-btn">
            {sidebarOpen ? <X size={20}/> : <Menu size={20}/>}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <div className="header-inner">
            <div>
                <h1 className="title">
                    {activeTab === 'map' ? 'Rede de Carregadores' : 'Dashboard'}
                </h1>
                <p className="subtitle">
                    {activeTab === 'map' ? 'Localização em tempo real' : 'Monitorização em tempo real'}
                </p>
            </div>
            {lastUpdate && (
                <div className="update-info">
                    <Clock size={14}/> 
                    <span>{lastUpdate.toLocaleTimeString('pt-PT')}</span>
                    <div className={`status-indicator ${error ? 'bg-red-500' : 'bg-green-500'}`}></div>
                </div>
            )}
          </div>
        </header>

        <div className="dashboard-content">
          {error && (
            <div className="dashboard-error" style={{backgroundColor:'#ef444420', padding:'10px', borderRadius:'8px', border:'1px solid #ef4444', color:'#fca5a5', marginBottom:'20px', display:'flex', gap:'10px', alignItems:'center'}}>
                <AlertCircle size={20}/> 
                <span>{error} - Verifique se a API Python está a correr na porta 5000</span>
            </div>
          )}
          
          {activeTab === 'overview' && <OverviewTab historyData={historyData} clustersData={clustersData} latestData={latestData} />}
          {activeTab === 'analytics' && <AnalyticsTab historyData={historyData} totalCost={totalCost} avgDuration={avgDuration} costDistribution={costDistribution} performanceData={performanceData} />}
          {activeTab === 'clusters' && (<ClustersTab mergedData={mergedData} clusterStatsArray={clusterStatsArray} centroidsData={centroidsData}/>
)}
          
          {/* --- ABA DO MAPA AGORA RECEBE stationsData --- */}
          {activeTab === 'map' && (<MapTab stations={stationsData} historyData={historyData} />)}
          
          {activeTab === 'history' && <HistoryTab historyData={historyData} />}
        </div>
      </main>
    </div>
  );
}

// --- Subcomponentes ---

// --- COMPONENTE DE MAPA ATUALIZADO ---
function MapTab({ stations, historyData }) {
    const [selectedStation, setSelectedStation] = useState(null);
    const defaultCenter = [38.7223, -9.1393];

    const center = selectedStation
        ? [selectedStation.latitude, selectedStation.longitude]
        : stations.length > 0
            ? [stations[0].latitude, stations[0].longitude]
            : defaultCenter;

    // Filtrar carregamentos da estação selecionada
    const stationHistory = selectedStation
        ? historyData.filter(h => String(h.station_idcharging).trim() === String(selectedStation.station_id).trim())
        : [];

    const totalLoads = stationHistory.length;
    const avgCost = totalLoads > 0
        ? (stationHistory.reduce((s, i) => s + i.charging_cost, 0) / totalLoads).toFixed(2)
        : 0;

    const avgDuration = totalLoads > 0
        ? (stationHistory.reduce((s, i) => s + i.charging_duration, 0) / totalLoads).toFixed(2)
        : 0;

    return (
        <div className="map-tab">
            <div className="map-container-card">
                <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {stations.map((station, idx) => (
                        <Marker
                            key={idx}
                            position={[station.latitude, station.longitude]}
                            eventHandlers={{
                                click: () => setSelectedStation(station)
                            }}
                        >
                            <Popup>
                                <div>
                                    <b>Estação: {station.station_id}</b><br />
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                        {station.concelho}, {station.distrito}
                                    </span><br />
                                    {station.potência_máxima_admissível_kw && (
                                        <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>
                                            Potência: {station.potência_máxima_admissível_kw} kW
                                        </span>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* ─────────────────────────────── */}
            {/* CARTÕES COM OS DADOS DA ESTAÇÃO */}
            {/* ─────────────────────────────── */}

            {selectedStation && (
                <div className="overview-row" style={{ marginTop: '1rem' }}>

                    <div className="stat-card">
                        <p className="stat-card-title">Concelho</p>
                        <span className="stat-card-value">{selectedStation.concelho}</span>
                    </div>

                    <div className="stat-card">
                        <p className="stat-card-title">Distrito</p>
                        <span className="stat-card-value">{selectedStation.distrito}</span>
                    </div>

                    <div className="stat-card">
                        <p className="stat-card-title">Potência Máx.</p>
                        <span className="stat-card-value">
                            {selectedStation.potência_máxima_admissível_kw || 'N/A'} kW
                        </span>
                    </div>

                    <div className="stat-card">
                        <p className="stat-card-title">Total Carregamentos</p>
                        <span className="stat-card-value">
                            {totalLoads}
                        </span>
                    </div>

                    <div className="stat-card">
                        <p className="stat-card-title">Custo Médio</p>
                        <span className="stat-card-value">
                            {avgCost} €
                        </span>
                    </div>

                    <div className="stat-card">
                        <p className="stat-card-title">Duração Média</p>
                        <span className="stat-card-value">
                            {avgDuration} h
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
function OverviewTab({ historyData, clustersData, latestData }) {
  return (
    <div className="overview-tab">
      <div className="overview-stats">
        <StatCard icon={<Database size={24}/>} title="Total Registos" value={historyData.length} />
        <StatCard icon={<Activity size={24}/>} title="Clusters Ativos" value={clustersData.length} />
        <StatCard icon={<TrendingUp size={24}/>} title="Energia Total" value={historyData.reduce((s, i) => s + i.energia, 0).toFixed(1)} unit="kWh" />
        <StatCard icon={<Battery size={24}/>} title="Taxa Atual" value={latestData?.charging_rate_kw || 0} unit="kW" />
      </div>
      <ChartCard title="Consumo de Energia ao Longo do Tempo" icon={<TrendingUp size={18}/>}>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={historyData}>
            <defs>
              <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
               <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="timestamp_formatted" stroke="#64748b" tick={{fontSize:12}} />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px'}} />
            <Legend />
            <Area type="monotone" dataKey="charging_rate" stroke="#10b981" fill="url(#colorRate)" name="Taxa (kW)" strokeWidth={2} />
            <Area type="monotone" dataKey="energia" stroke="#3b82f6" fill="url(#colorEnergy)" name="Energia (kWh)" strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
       {latestData && (
        <ChartCard title="Último Carregamento" icon={<Zap size={18}/>}>
          <div className="overview-row">
            <DataField label="ID" value={latestData.id || 'N/A'} />
            <DataField label="Temperatura" value={`${latestData.temperature_c || 'N/A'}°C`} />
            <DataField label="Taxa" value={`${latestData.charging_rate_kw || 'N/A'} kW`} />
            <DataField label="Energia" value={`${latestData.energy_consumed_kwh || 'N/A'} kWh`} />
            <DataField label="Timestamp" value={new Date(latestData.timestamp || new Date()).toLocaleTimeString('pt-PT')} />
          </div>
        </ChartCard>
      )}
    </div>
  );
}

function ClustersTab({ mergedData, clusterStatsArray, centroidsData }) {
  return (
    <div className="clusters-tab">
      <div className="clusters-row">

        <ChartCard title="Clusters (K-Means)" icon={<Activity size={18}/>}>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#4a4d52ff" />
              
              {/* --- EIXO X: Agora é a IDADE --- */}
              <XAxis
                type="number"
                dataKey="percentagem"
                name="Percentagem de carga inicial"
                unit="%"
                stroke="#64748b"

              />

              {/* --- EIXO Y: Agora é o TEMPO DE CARGA --- */}
              <YAxis
                type="number"
                dataKey="distancia"
                name="Distância percorrida desde o último carregamento"
                unit="Km"
                stroke="#64748b"
              />

              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#b8b5daff', borderColor: '#b8b5daff' }}
              />
              <Legend />

              {/* 🔵🔴🟡 PONTOS DO DATASET */}
              <Scatter name="Cluster 0" data={mergedData} fill="#ef4444">
                
              </Scatter>

              
              <Scatter name="Cluster 1" data={mergedData} fill="#0004ffff">
                  
              </Scatter>

              <Scatter name="Cluster 2" data={mergedData} fill="#dbe913ff">
            
              </Scatter>

              <Scatter name="Cluster 3" data={mergedData} fill="#ff009dff">
                {mergedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    // Garante que o índice da cor é válido
                    fill={CLUSTER_COLORS[Math.abs(entry.cluster || 0) % CLUSTER_COLORS.length]}
                  />
                ))}
              </Scatter>

              {/* ⭐⭐ CENTROIDES ⭐⭐ */}
              <Scatter
                name="Centroides"
                data={centroidsData}
                shape="star"
                fill="#ffffff"
              >
                {centroidsData.map((entry, index) => (
                  <Cell key={`centroid-${index}`} fill="#ffffff" />
                ))}
              </Scatter>

            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* --- SEGUNDO GRÁFICO: DISTRIBUIÇÃO DOS CLUSTERS --- */}
        <ChartCard title="Distribuição" icon={<BarChart3 size={18}/>}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChartR data={clusterStatsArray}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="cluster" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#d7dbe6ff', borderColor: '#334155' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChartR>
          </ResponsiveContainer>
        </ChartCard>

      </div>
    </div>
  );
}

function StatCard({ icon, title, value, unit }) {
    return (
        <div className="stat-card">
            <div className="stat-card-header"><div className="stat-card-icon">{icon}</div></div>
            <p className="stat-card-title">{title}</p>
            <div className="stat-card-value-wrap">
                <span className="stat-card-value">{value}</span>
                {unit && <span className="stat-card-unit">{unit}</span>}
            </div>
        </div>
    )
}

function ChartCard({ title, icon, children }) {
    return (
        <div className="chart-card">
            <div className="chart-card-title">
                <span className="chart-card-icon">{icon}</span> <span>{title}</span>
            </div>
            {children}
        </div>
    )
}

function DataField({ label, value }) {
  return (
    <div className="data-field">
      <label className="data-field-label">{label}</label>
      <span className="data-field-value">{value}</span>
    </div>
  );
}

function AnalyticsTab({ historyData, totalCost, avgDuration, costDistribution, performanceData }) {
    return (
        <div className="analytics-tab">
            <div className="analytics-stats">
                <StatCard icon={<DollarSign size={24}/>} title="Custo Total" value={totalCost.toFixed(2)} unit="€"/>
                <StatCard icon={<Clock size={24}/>} title="Duração Média" value={avgDuration} unit="h"/>
                <StatCard icon={<Thermometer size={24}/>} title="Temp Média" value={(historyData.length > 0 ? historyData.reduce((s,i)=>s+i.temperatura,0)/historyData.length : 0).toFixed(1)} unit="°C"/>
            </div>
            <div className="analytics-row">
                <ChartCard title="Distribuição de Custos" icon={<DollarSign size={18}/>}>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={costDistribution} dataKey="value" cx="50%" cy="50%" outerRadius={80} label>
                                {costDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={CLUSTER_COLORS[index % CLUSTER_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor:'#334155'}}/>
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Performance Radar" icon={<Activity size={18}/>}>
                    <ResponsiveContainer width="100%" height={300}>
                         <RadarChart data={performanceData}>
                            <PolarGrid stroke="#334155"/>
                            <PolarAngleAxis dataKey="subject" stroke="#64748b"/>
                            <PolarRadiusAxis stroke="#64748b"/>
                            <Radar name="Temp" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                            <Radar name="Energia x10" dataKey="B" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
                            <Legend/>
                            <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor:'#334155'}}/>
                         </RadarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>
        </div>
    )
}

function HistoryTab({ historyData }) {
    return (
        <ChartCard title="Histórico Completo" icon={<FileText size={18}/>}>
            <div className="history-table-wrap">
                <table className="history-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Hora Início</th>
                            <th>Energia</th>
                            <th>Custo</th>
                            <th>Duração</th>
                        </tr>
                    </thead>
                    <tbody>
                      {[...historyData]
                        .sort((a,b) => b.id - a.id) // ⬅ ordenação crescente
                        .map((row, i) => (
                          <tr key={i}>
                            <td>{row.id}</td>
                            <td>{row.timestamp_formatted}</td>
                            <td>{row.energia.toFixed(2)} kWh</td>
                            <td>{row.charging_cost.toFixed(2)} €</td>
                            <td>{row.charging_duration.toFixed(2)} h</td>
                          </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </ChartCard>
    )
}