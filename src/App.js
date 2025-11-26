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
  Battery, TrendingUp, Database, Activity, Clock, Sun, Star, Calendar, Filter, AlertCircle,
  Zap, BarChart3, Home, FileText, Menu, X, ChevronRight,
  Sparkles, DollarSign, Thermometer, Map as MapIcon, Users, ArrowRightLeft, User
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
  const [periodFilter, setPeriodFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');


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
            // Normaliza formato da data
            const dateStr = rawDate.replace(' ', 'T');
            const dateObj = new Date(dateStr);

            const hour = dateObj.getHours();
            let timeOfDay = 'Noite';
            if (hour >= 6 && hour < 12) timeOfDay = 'Manhã';
            else if (hour >= 12 && hour < 18) timeOfDay = 'Tarde';
            else if (hour >= 18 && hour < 24) timeOfDay = 'Noite';

            function getWeekNumber(date) {
              const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
              const dayNum = d.getUTCDay() || 7;
              d.setUTCDate(d.getUTCDate() + 4 - dayNum);
              const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
              return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            }

            return {
              ...item,
              timestamp_obj: dateObj,
              timestamp_formatted: isNaN(dateObj) 
                ? 'Hora Inválida' 
                : dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
              date_formatted: isNaN(dateObj) ? "Data Inválida" : dateObj.toLocaleDateString('pt-PT'),
              full_date: dateObj,
              day: isNaN(dateObj) ? "Dia Inválido" : dateObj.toLocaleDateString('pt-PT', { weekday: 'short' }),
              week: isNaN(dateObj) ? "Semana Inválida" : getWeekNumber(dateObj),
              month: isNaN(dateObj) ? "Mês Inválido" : dateObj.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' }),
              hora: isNaN(dateObj) ? null : hour,
              timeOfDay: isNaN(dateObj) ? "Indefinido" : timeOfDay,
              temperatura: parseFloat(item.temperature_c) || 0,
              energia: parseFloat(item.energy_consumed_kwh) || 0,
              charging_rate: parseFloat(item.charging_rate_kw) || 0,
              charging_duration: parseFloat(item.charging_duration_hours ?? item.charging_duration) || 0,
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


  const filteredData = historyData.filter(item => {
  if (periodFilter === 'all') return true;

  const now = new Date();
  // Usa o campo certo!
  const itemDate = item.timestamp_obj || item.full_date || new Date(item.timestamp); // garante Date

  if (periodFilter === 'today') {
    return itemDate.toDateString() === now.toDateString();
  }

  if (periodFilter === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return itemDate >= weekAgo;
  }
  if (periodFilter === 'month') {
    return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
  }
  if (periodFilter === 'custom') {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return itemDate >= start && itemDate <= end;
    }
  }
  return true;
});



  // --- Renderização do Menu ---
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'clusters', label: 'Clusters', icon: Activity },
    { id: 'map', label: 'Localização', icon: MapIcon }, 
    { id: 'history', label: 'Histórico', icon: FileText },
    { id: 'trends', label: 'Tendências', icon: TrendingUp },
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="title">
                  {activeTab === 'overview' && 'Dashboard'}
                  {activeTab === 'trends' && 'Análise de Tendências'}
                  {activeTab === 'clusters' && 'Análise de Clusters'}
                  {activeTab === 'map' && 'Mapa de Carregadores'}
                  {activeTab === 'history' && 'Histórico Completo'}
                </h1>
                <p className="subtitle">
                  {activeTab === 'trends' && 'Padrões diários, semanais e mensais'}
                  {activeTab === 'clusters' && 'Machine Learning e padrões'}
                  {activeTab === 'map' && 'Localização dos pontos de carregamento'}
                  {activeTab === 'history' && 'Todos os carregamentos registados'}
                </p>
              </div>
              {(activeTab === 'trends') && (
                <div className="period-filter-bar">
                  <span className="filter-label"><Filter style={{marginRight: '4px'}}/>Período:</span>
                  <button className={periodFilter === 'all' ? 'period-btn active' : 'period-btn'} onClick={() => setPeriodFilter('all')}>Todos</button>
                  <button className={periodFilter === 'today' ? 'period-btn active' : 'period-btn'} onClick={() => setPeriodFilter('today')}>Hoje</button>
                  <button className={periodFilter === 'week' ? 'period-btn active' : 'period-btn'} onClick={() => setPeriodFilter('week')}>Última Semana</button>
                  <button className={periodFilter === 'month' ? 'period-btn active' : 'period-btn'} onClick={() => setPeriodFilter('month')}>Este Mês</button>
                  <button className={periodFilter === 'custom' ? 'period-btn active' : 'period-btn'} onClick={() => setPeriodFilter('custom')}>Personalizado</button>
                  {periodFilter === 'custom' && (
                    <div className="period-date-group">
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="period-date-input"
                      />
                      <span style={{margin: '0 5px'}}>até</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="period-date-input"
                      />
                    </div>
                  )}
                  <span className="registos-label">{filteredData.length} de {historyData.length} registos</span>
                </div>
              )}
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
          {activeTab === 'clusters' && (<ClustersTab mergedData={mergedData} clusterStatsArray={clusterStatsArray} centroidsData={centroidsData}/>)}
          {activeTab === 'map' && (<MapTab stations={stationsData} historyData={historyData} />)}
          {activeTab === 'history' && <HistoryTab historyData={historyData} />}
          {activeTab === 'trends' && <TrendsTab historyData={filteredData} />}
            
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

function OverviewTab({ historyData, clustersData = [], latestData }) {
  // Estatísticas principais
  const energiaTotal = historyData.reduce((s, i) => s + i.energia, 0);
  const custoTotal = historyData.reduce((s, i) => s + i.charging_cost, 0);
  const duracaoTotal = historyData.reduce((s, i) => s + (i.charging_duration ?? 0), 0);
  const duracaoMedia = historyData.length > 0 ? (duracaoTotal / historyData.length).toFixed(2) : "0.0";
  const tempMedia = historyData.length > 0 ? (historyData.reduce((s,i)=>s+i.temperatura,0)/historyData.length).toFixed(1) : "0.0";
  const custoMedio = historyData.length > 0 ? (custoTotal / historyData.length).toFixed(2) : '0.00';
  const energiaMedia = historyData.length > 0 ? (energiaTotal / historyData.length).toFixed(2) : '0.00';
  const avgPower = historyData.length > 0 ? (historyData.reduce((s, i) => s + (i.charging_rate ?? 0), 0) / historyData.length).toFixed(2) : "0.0";
 
  // Top N carregamentos por custo
  const top3Custo = [...historyData]
    .sort((a, b) => b.charging_cost - a.charging_cost)
    .slice(0, 3);
  const topEnergia = [...historyData]
    .sort((a, b) => b.energia - a.energia)
    .slice(0, 3);

  // Evolução Custo/energia por mês
  const mensal = {};
  for (const i of historyData) {
    if (!mensal[i.month]) mensal[i.month]={count:0, energia:0, custo:0};
    mensal[i.month].count++;
    mensal[i.month].energia += i.energia;
    mensal[i.month].custo += i.charging_cost;
  }
  const mensalArray = Object.entries(mensal).map(([month, stat]) => ({
    month, sessoes: stat.count, energia: stat.energia, custo: stat.custo
  }));

  // Evolução diária do custo/energia (line)
  const daily = {};
  for (const i of historyData) {
    if (!daily[i.date_formatted]) daily[i.date_formatted]={date:i.date_formatted, energia:0, custo:0, sessoes:0};
    daily[i.date_formatted].energia+=i.energia;
    daily[i.date_formatted].custo+=i.charging_cost;
    daily[i.date_formatted].sessoes++;
  }
  const dailyArray = Object.values(daily);

  return (
    <div className="overview-tab">
      {/* Estatísticas rápidas */}
      <div className="overview-stats">
        <StatCard icon={<Database size={24}/>} title="Registos" value={historyData.length} />
        <StatCard icon={<DollarSign size={24}/>} title="Custo Total" value={custoTotal.toFixed(2)} unit="€"/>
        <StatCard icon={<Zap size={24}/>} title="Energia Total" value={energiaTotal.toFixed(1)} unit="kWh" />
        <StatCard icon={<Clock size={24}/>} title="Duração Média" value={duracaoMedia} unit="h"/>
        <StatCard icon={<Thermometer size={24}/>} title="Temp Média" value={tempMedia} unit="°C"/>
        <StatCard icon={<DollarSign size={22} />} title="Valor Médio" value={custoMedio} unit="€/sessão" />
        <StatCard icon={<Zap size={22} />} title="Energia Média" value={energiaMedia} unit="kWh/sessão" />
        <StatCard icon={<Activity size={20}/>} title="Potência Média" value={avgPower} unit="kW"/>
      </div>

      {/* EVOLUÇÃO MENSAL GERAL */}
      <ChartCard title="Resumo Mensal" icon={<TrendingUp size={18}/>}>
        <ResponsiveContainer width="100%" height={150}>
          <BarChartR data={mensalArray}>
            <XAxis dataKey="month" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{background: "#0f172a", color: "#fff", borderRadius:"8px"}}/>
            <Legend />
            <Bar dataKey="custo" fill="#f59e0b" name="Custo (€)" radius={6}/>
            <Bar dataKey="energia" fill="#10b981" name="Energia (kWh)" radius={6}/>
          </BarChartR>
        </ResponsiveContainer>
      </ChartCard>
      
      {/* EVOLUÇÃO DIÁRIA (Custo, Energia) */}
      <ChartCard title="Evolução Diária de Custo/Energia" icon={<TrendingUp size={16}/>} >
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={dailyArray}>
            <XAxis dataKey="date" stroke="#64748b" tick={{fontSize:11}}/>
            <YAxis stroke="#64748b"/>
            <Tooltip contentStyle={{background: "#0f172a", color: "#fff", borderRadius:"8px"}}/>
            <Legend />
            <Line type="monotone" dataKey="energia" stroke="#10b981" strokeWidth={2} name="Energia (kWh)" />
            <Line type="monotone" dataKey="custo" stroke="#f59e0b" strokeWidth={2} name="Custo (€)"/>
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top 3 custos */}
      <ChartCard title="Top 3 Sessões Mais Caras" icon={<Star size={18} />}>
        <table style={{width:'100%', fontSize:'1rem'}}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Custo</th>
              <th>Energia</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            {top3Custo.map((row,i) => (
              <tr key={row.id || i}>
                <td>{row.id}</td>
                <td>{row.date_formatted}</td>
                <td><b style={{color:'#f59e0b'}}>{row.charging_cost.toFixed(2)} €</b></td>
                <td>{row.energia.toFixed(1)} kWh</td>
                <td>{row.charging_duration?.toFixed(2) || row.charging_duration_hours?.toFixed(2) || "-"} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      {/* Top 3 energia */}
      <ChartCard title="Top 3 Sessões Mais Longas (Energia)" icon={<Zap size={16} />}>
        <table style={{width:'100%', fontSize:'1rem'}}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Energia</th>
              <th>Custo</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            {topEnergia.map((row,i) => (
              <tr key={row.id || i}>
                <td>{row.id}</td>
                <td>{row.date_formatted}</td>
                <td><b style={{color:'#f59e0b'}}>{row.energia.toFixed(1)} kWh</b></td>
                <td>{row.charging_cost.toFixed(2)} €</td>
                <td>{row.charging_duration?.toFixed(2) || row.charging_duration_hours?.toFixed(2) || "-"} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

    </div>
  );
}

function ClustersTab({ mergedData, clusterStatsArray, centroidsData }) {
  const totalClusters = clusterStatsArray.length;
  const totalPontos = mergedData.length;
  const maxCluster = clusterStatsArray.reduce((acc, c) => c.count > acc.count ? c : acc, clusterStatsArray[0] || {count: 0});
  const minCluster = clusterStatsArray.reduce((acc, c) => c.count < acc.count ? c : acc, clusterStatsArray[0] || {count: 0});

  // Sugestão: distribuição percentual
  const totalClusterCount = clusterStatsArray.reduce((sum, c) => sum + c.count, 0);
  const percentByCluster = clusterStatsArray.map(c => ({
    ...c,
    percent: totalClusterCount > 0 ? ((c.count / totalClusterCount) * 100).toFixed(1) : "0.0"
  }));
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
              content={<CustomTooltip />}
            />


              <Legend />

              {/* 🔵🔴🟡 PONTOS DO DATASET */}
              <Scatter name="Cluster 0" data={mergedData} fill="#3b82f6">
              </Scatter>
 
              <Scatter name="Cluster 1" data={mergedData} fill="#10b981">
              </Scatter>

              <Scatter name="Cluster 2" data={mergedData} fill="#f59e0b">
              </Scatter>

             <Scatter name="Cluster 3" data={mergedData} fill="#ef4444">
                {mergedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    // Garante que o índice da cor é válido
                    fill={CLUSTER_COLORS[Math.abs(entry.cluster || 0) % CLUSTER_COLORS.length]}
                  />
                ))}
              </Scatter>

              <Scatter
                name="Centroides"
                data={centroidsData}
                shape="star"
                fill="#fff"
                legendType="star"    // <- Adiciona estrela à legenda!
              >
                {centroidsData.map((entry, idx) => (
                  <Cell key={idx} fill="#fff" />
                ))}
              </Scatter>

            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* --- SEGUNDO GRÁFICO: DISTRIBUIÇÃO DOS CLUSTERS --- */}
        <ChartCard title="Distribuição de Pontos" icon={<BarChart3 size={18}/>}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChartR data={percentByCluster}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="cluster" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                contentStyle={{ backgroundColor: '#23273f', color:'#fff', borderRadius:8 }}
                itemStyle={{color: '#fff'}}
                formatter={(value, n, p) => [`${value} ponto${value>1?"s":""}`]}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]}>
                {percentByCluster.map((entry, idx) =>
                  <Cell key={idx} fill={CLUSTER_COLORS[idx % CLUSTER_COLORS.length]} />
                )}
              </Bar>
            </BarChartR>
          </ResponsiveContainer>
        </ChartCard>
      </div>

       {/* Indicadores rápidos dos clusters */}
      <div className='overview-stats'>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon"><Users size={22}/></div></div>
          <p className="stat-card-title">Nº Clusters</p>
          <div className="stat-card-value-wrap"><span className="stat-card-value">{totalClusters}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon"><Zap size={22}/></div></div>
          <p className="stat-card-title">Total Pontos</p>
          <div className="stat-card-value-wrap"><span className="stat-card-value">{totalPontos}</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon"><ArrowRightLeft size={22}/></div></div>
          <p className="stat-card-title">Maior Cluster</p>
          <div className="stat-card-value-wrap">
            <span className="stat-card-value">{maxCluster?.cluster}</span>
            <span className="stat-card-unit">{maxCluster?.count || '-'}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-card-icon"><ArrowRightLeft size={22}/></div></div>
          <p className="stat-card-title">Menor Cluster</p>
          <div className="stat-card-value-wrap">
            <span className="stat-card-value">{minCluster?.cluster}</span>
            <span className="stat-card-unit">{minCluster?.count || '-'}</span>
          </div>
        </div>
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

function HistoryTab({ historyData = [] }) {
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
            {[...(historyData || [])]
              .sort((a,b) => b.id - a.id)
              .map((row, i) => (
                <tr key={i}>
                  <td>{row.id}</td>
                  <td>{row.timestamp_formatted || '-'}</td>
                  <td>{row.energia !== undefined ? row.energia.toFixed(2) + " kWh" : '-'}</td>
                  <td>{row.charging_cost !== undefined ? row.charging_cost.toFixed(2) + " €" : '-'}</td>
                  <td>{row.charging_duration !== undefined ? row.charging_duration.toFixed(2) + " h" : '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}


function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    // Usa um Set para eliminar duplicados (pode usar percentagem+distancia como chave)
    const seen = new Set();
    const uniquePayload = payload.filter(item => {
      const key = `${item.payload.distancia}-${item.payload.percentagem}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return (
      <div style={{ background: '#b8b5daff', border: '1px solid #b8b5daff', borderRadius: 8, padding: 8 }}>
        {uniquePayload.map((entry, idx) => (
          <div key={idx}>
            <span>Distância: {entry.payload.distancia} Km</span><br />
            <span>Percentagem inicial: {entry.payload.percentagem}%</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}




function TrendsTab({ historyData }) {
  const dailyData = historyData.reduce((acc, item) => {
    const key = item.date_formatted;
    if (!acc[key]) {
      acc[key] = { date: key, sessions: 0, energia: 0, custo: 0, duracao: 0 };
    }
    acc[key].sessions += 1;
    acc[key].energia += item.energia;
    acc[key].custo += item.charging_cost;
    acc[key].duracao += item.charging_duration;
    return acc;
  }, {});

  const weeklyData = historyData.reduce((acc, item) => {
    const key = `Semana ${item.week}`;
    if (!acc[key]) {
      acc[key] = { week: key, sessions: 0, energia: 0, custo: 0, duracao: 0 };
    }
    acc[key].sessions += 1;
    acc[key].energia += item.energia;
    acc[key].custo += item.charging_cost;
    acc[key].duracao += item.charging_duration;
    return acc;
  }, {});

  const monthlyData = historyData.reduce((acc, item) => {
    const key = item.month;
    if (!acc[key]) {
      acc[key] = { month: key, sessions: 0, energia: 0, custo: 0, duracao: 0 };
    }
    acc[key].sessions += 1;
    acc[key].energia += item.energia;
    acc[key].custo += item.charging_cost;
    acc[key].duracao += item.charging_duration;
    return acc;
  }, {});

  const timeOfDayData = historyData.reduce((acc, item) => {
    const key = item.timeOfDay;
    if (!acc[key]) {
      acc[key] = { timeOfDay: key, count: 0 };
    }
    acc[key].count += 1;
    return acc;
  }, {});

  const dailyArray = Object.values(dailyData);
  const weeklyArray = Object.values(weeklyData);
  const monthlyArray = Object.values(monthlyData);
  const timeArray = Object.values(timeOfDayData);

  const totalSessions = historyData.length;
  const totalEnergia = historyData.reduce((sum, item) => sum + item.energia, 0);
  const totalCusto = historyData.reduce((sum, item) => sum + item.charging_cost, 0);
  const avgDuracao = totalSessions > 0 ? (historyData.reduce((sum, item) => sum + item.charging_duration, 0) / totalSessions) : 0;

  const userAggregation = historyData.reduce((acc, item) => {
    if (!item.user_id) return acc;
    if (!acc[item.user_id]) acc[item.user_id] = { user: item.user_id, energia: 0, custo: 0, duracao: 0 };
    acc[item.user_id].energia += item.energia;
    acc[item.user_id].custo += item.charging_cost;
    acc[item.user_id].duracao += item.charging_duration || 0;
    return acc;
  }, {});
  const userArray = Object.values(userAggregation).sort((a, b) => b.energia - a.energia);

  return (
    <div className="overview-tab">
      <div className="overview-stats">
        <StatCard icon={<Activity />} title="Total Sessões" value={totalSessions} />
        <StatCard icon={<Zap />} title="Energia Total" value={totalEnergia.toFixed(1)} unit="kWh" />
        <StatCard icon={<DollarSign />} title="Custo Total" value={totalCusto.toFixed(2)} unit="€" />
        <StatCard icon={<Clock />} title="Duração Média" value={avgDuracao.toFixed(2)} unit="h" />
      </div>
      
      <ChartCard title="Tendências Diárias" icon={<Calendar />}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChartR data={dailyArray}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
            <Legend />
            <Bar dataKey="sessions" name="Sessões" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChartR>
        </ResponsiveContainer>
      </ChartCard>

      
        <ChartCard title="Energia por Dia (kWh)" icon={<Zap />}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyArray}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
              <Line type="monotone" dataKey="energia" stroke="#10b981" strokeWidth={3} name="Energia (kWh)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Custo por Dia (€)" icon={<DollarSign />}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyArray}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
              <Area type="monotone" dataKey="custo" stroke="#f59e0b" fillOpacity={1} fill="url(#costGradient)" name="Custo (€)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
     

      <ChartCard title="Sessões por Período do Dia" icon={<Sun />}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={timeArray}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({timeOfDay, count}) => `${timeOfDay}: ${count}`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="count"
            >
              {timeArray.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CLUSTER_COLORS[index % CLUSTER_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tendências Semanais" icon={<TrendingUp />}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChartR data={weeklyArray}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="week" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
            <Bar dataKey="energia" name="Energia (kWh)" fill="#10b981" radius={[8, 8, 0, 0]} />
          </BarChartR>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tendências Mensais" icon={<Calendar />}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyArray}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
            <Legend />
            <Line type="monotone" dataKey="sessions" stroke="#3b82f6" strokeWidth={3} name="Sessões" />
            <Line type="monotone" dataKey="energia" stroke="#10b981" strokeWidth={3} name="Energia (kWh)" />
            <Line type="monotone" dataKey="custo" stroke="#f59e0b" strokeWidth={3} name="Custo (€)" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Utilização por Utilizador" icon={<User />}>
  {/* Energia total por utilizador */}
  <div style={{width: '100%', height: 130, marginBottom: "1.4rem"}}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChartR data={userArray}>
        <XAxis dataKey="user" stroke="#64748b" angle={-45} textAnchor="end" interval={0} />
        <YAxis stroke="#64748b" />
        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: '12px' }}
          formatter={v => [`${v.toFixed(1)} kWh`, "Energia"]}/>
        <Bar dataKey="energia" name="Energia Total (kWh)" fill="#10b981" />
      </BarChartR>
    </ResponsiveContainer>
  </div>
  {/* Duração total por utilizador */}
  <div style={{width: '100%', height: 130}}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChartR data={userArray}>
        <XAxis dataKey="user" stroke="#64748b" angle={-45} textAnchor="end" interval={0} />
        <YAxis stroke="#64748b" />
        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: '12px' }}
          formatter={v => [`${v.toFixed(2)} h`, "Duração Total"]}/>
        <Bar dataKey="duracao" name="Duração Total (h)" fill="#f59e0b" />
      </BarChartR>
    </ResponsiveContainer>
  </div>
</ChartCard>


          
    </div>
  );
}