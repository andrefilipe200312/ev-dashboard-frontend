import React, { useEffect, useState } from 'react';
import './App.css';

import {
  Battery, TrendingUp, Database, Activity, Clock, AlertCircle,
  Zap, BarChart3, Home, FileText, Menu, X, ChevronRight,
  Sparkles, DollarSign, Thermometer
} from 'lucide-react';
import {
  LineChart, Line, ScatterChart, Scatter, Cell, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend, BarChart as BarChartR, Bar,
  AreaChart, Area, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

const API_BASE_URL = 'http://localhost:5000';
const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Dashboard() {
  const [latestData, setLatestData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [clustersData, setClustersData] = useState([]);
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [latestRes, historyRes, clustersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/latest`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/history`).catch(() => ({ ok: false })),
        fetch(`${API_BASE_URL}/api/clusters`).catch(() => ({ ok: false }))
      ]);

      if (latestRes.ok) {
        const latest = await latestRes.json();
        setLatestData(latest);
      }

      if (historyRes.ok) {
        const history = await historyRes.json();
        const sorted = [...history]
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .map(item => ({
            ...item,
            timestamp_formatted: new Date(item.timestamp).toLocaleTimeString('pt-PT', {
              hour: '2-digit',
              minute: '2-digit'
            }),
            temperatura: parseFloat(item.temperature_c) || 0,
            energia: parseFloat(item.energy_consumed_kwh) || 0,
            charging_rate: parseFloat(item.charging_rate_kw) || 0,
            charging_duration: parseFloat(item.charging_duration_hours) || 0,
            charging_cost: parseFloat(item.charging_cost_eur) || 0,
          }));
        setHistoryData(sorted);
      }

      if (clustersRes.ok) {
        const clusters = await clustersRes.json();
        setClustersData(clusters);
        const clusterMap = clusters.reduce((acc, row) => {
          acc[row.device_id] = row.cluster;
          return acc;
        }, {});
        if (historyRes.ok) {
          const history = await historyRes.json();
          const merged = history
            .map(item => ({
              ...item,
              temperatura: parseFloat(item.temperature_c) || 0,
              energia: parseFloat(item.energy_consumed_kwh) || 0,
              cluster: clusterMap[String(item.id)]
            }))
            .filter(item =>
              item.cluster !== undefined &&
              !isNaN(item.temperatura) &&
              !isNaN(item.energia)
            );
          setMergedData(merged);
        }
      }

      setLastUpdate(new Date());
      setLoading(false);
    } catch (err) {
      setError('Falha ao conectar com o servidor');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const clusterStats = mergedData.reduce((acc, item) => {
    const cluster = item.cluster;
    if (!acc[cluster]) {
      acc[cluster] = { count: 0, avgTemp: 0, avgEnergy: 0, totalTemp: 0, totalEnergy: 0 };
    }
    acc[cluster].count++;
    acc[cluster].totalTemp += item.temperatura;
    acc[cluster].totalEnergy += item.energia;
    return acc;
  }, {});
  Object.keys(clusterStats).forEach(key => {
    const stat = clusterStats[key];
    stat.avgTemp = (stat.totalTemp / stat.count).toFixed(1);
    stat.avgEnergy = (stat.totalEnergy / stat.count).toFixed(2);
  });
  const clusterStatsArray = Object.entries(clusterStats).map(([cluster, stats]) => ({
    cluster: `Cluster ${cluster}`,
    clusterNum: parseInt(cluster),
    count: stats.count,
    avgTemp: parseFloat(stats.avgTemp),
    avgEnergy: parseFloat(stats.avgEnergy)
  }));
  const costDistribution = historyData.slice(-5).map((item, idx) => ({
    name: `Sessão ${idx + 1}`,
    value: parseFloat(item.charging_cost || 0)
  }));
  const performanceData = clusterStatsArray.slice(0, 5).map(item => ({
    subject: item.cluster,
    A: item.avgTemp,
    B: item.avgEnergy * 10,
    fullMark: 100
  }));

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'clusters', label: 'Clusters', icon: Activity },
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
    );
  }

  const totalCost = historyData.reduce((sum, item) => sum + item.charging_cost, 0);
  const avgDuration = historyData.length > 0
    ? (historyData.reduce((sum, item) => sum + item.charging_duration, 0) / historyData.length).toFixed(2)
    : 0;

  return (
    <div className="bg-gradient-dashboard">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-bg-gradient"><Zap size={24}/></div>
            {sidebarOpen && (
              <div>
                <h2 className="sidebar-title">EV Charge</h2>
              </div>
            )}
          </div>
        </div>
        <nav className="sidebar-menu">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`menu-button ${isActive ? 'menu-button-active' : 'menu-button-inactive'}`}
              >
                <Icon size={20} className="menu-icon"/>
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && isActive && <ChevronRight size={16} className="ml-auto"/>}
              </button>
            );
          })}
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
                {activeTab === 'overview' && 'Dashboard Overview'}
                {activeTab === 'analytics' && 'Analytics & Insights'}
                {activeTab === 'clusters' && 'Análise de Clusters'}
                {activeTab === 'history' && 'Histórico Completo'}
              </h1>
              <p className="subtitle">
                {activeTab === 'overview' && 'Monitorização em tempo real'}
                {activeTab === 'analytics' && 'Análise detalhada de desempenho'}
                {activeTab === 'clusters' && 'Machine Learning e padrões'}
                {activeTab === 'history' && 'Todos os carregamentos registados'}
              </p>
            </div>
            {lastUpdate && (
              <div className="update-info">
                <Clock size={14}/>
                <span>Atualizado</span>
                <p className="update-time">{lastUpdate.toLocaleTimeString('pt-PT')}</p>
                <div className="status-indicator"></div>
              </div>
            )}
          </div>
        </header>
        <div className="dashboard-content">
          {error && (
            <div className="dashboard-error">
              <AlertCircle size={20}/>
              <span>{error}</span>
            </div>
          )}
          {activeTab === 'overview' &&
            <OverviewTab historyData={historyData} clustersData={clustersData} latestData={latestData}/>}
          {activeTab === 'analytics' &&
            <AnalyticsTab historyData={historyData} totalCost={totalCost} avgDuration={avgDuration} costDistribution={costDistribution} performanceData={performanceData}/>}
          {activeTab === 'clusters' &&
            <ClustersTab mergedData={mergedData} clusterStatsArray={clusterStatsArray}/>}
          {activeTab === 'history' &&
            <HistoryTab historyData={historyData}/>}
        </div>
      </main>
    </div>
  );
}

function OverviewTab({ historyData, clustersData, latestData }) {
  return (
    <div className="overview-tab">
      <div className="overview-stats">
        <StatCard icon={<Database size={24}/>} title="Total Registos" value={historyData.length} />
        <StatCard icon={<Activity size={24}/>} title="Clusters Ativos" value={clustersData.length} />
        <StatCard icon={<TrendingUp size={24}/>} title="Energia Total" value={historyData.reduce((sum, item) => sum + item.energia, 0).toFixed(1)} unit="kWh" />
        <StatCard icon={<Battery size={24}/>} title="Taxa Atual" value={latestData ? parseFloat(latestData.charging_rate_kw || 0).toFixed(1) : '0'} unit="kW" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
            <XAxis dataKey="timestamp_formatted" stroke="#64748b" tick={{ fontSize: 12 }}/>
            <YAxis stroke="#64748b"/>
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', color: 'white' }}/>
            <Legend />
            <Area type="monotone" dataKey="charging_rate" stroke="#10b981" fillOpacity={1} fill="url(#colorRate)" name="Taxa (kW)" strokeWidth={2}/>
            <Area type="monotone" dataKey="energia" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEnergy)" name="Energia (kWh)" strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      {latestData && (
        <ChartCard title="Último Carregamento Registado" icon={<Zap size={18}/>}>
          <div className="overview-row">
            <DataField label="ID" value={latestData.id || 'N/A'} />
            <DataField label="Temperatura" value={`${latestData.temperature_c || 'N/A'}°C`} />
            <DataField label="Taxa" value={`${latestData.charging_rate_kw || 'N/A'} kW`} />
            <DataField label="Energia" value={`${latestData.energy_consumed_kwh || 'N/A'} kWh`} />
            <DataField label="Duração" value={`${latestData.charging_duration_hours || 'N/A'} h`} />
            <DataField label="Custo" value={`${latestData.charging_cost_eur || 'N/A'} €`} />
            <DataField label="Bateria" value={`${latestData.battery_level_percent || 'N/A'}%`} />
            <DataField label="Timestamp" value={new Date(latestData.timestamp).toLocaleTimeString('pt-PT') || 'N/A'} />
          </div>
        </ChartCard>
      )}
    </div>
  );
}

function StatCard({ icon, title, value, unit, change }) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <div className="stat-card-icon">{icon}</div>
        {change && <span className="stat-card-change">{change}</span>}
      </div>
      <p className="stat-card-title">{title}</p>
      <div className="stat-card-value-wrap">
        <span className="stat-card-value">{value}</span>
        {unit && <span className="stat-card-unit">{unit}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, icon, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">
        <span className="chart-card-icon">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
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
        <StatCard icon={<Clock size={24}/>} title="Duração Média" value={avgDuration} unit="horas"/>
        <StatCard icon={<Thermometer size={24}/>} title="Temp. Média" value={(historyData.reduce((sum, item) => sum + item.temperatura, 0) / historyData.length).toFixed(1)} unit="°C"/>
      </div>
      <ChartCard title="Análise Detalhada de Métricas" icon={<BarChart3 size={18}/>}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={historyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
            <XAxis dataKey="timestamp_formatted" stroke="#64748b"/>
            <YAxis stroke="#64748b"/>
            <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}/>
            <Legend />
            <Line type="monotone" dataKey="charging_rate" stroke="#10b981" strokeWidth={3} name="Taxa (kW)" />
            <Line type="monotone" dataKey="charging_duration" stroke="#3b82f6" strokeWidth={3} name="Duração (h)" />
            <Line type="monotone" dataKey="charging_cost" stroke="#f59e0b" strokeWidth={3} name="Custo (€)" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="analytics-row">
        <ChartCard title="Distribuição de Custos" icon={<DollarSign size={18}/>}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={costDistribution} cx="50%" cy="50%" labelLine={false} label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`} outerRadius={80} fill="#8884d8" dataKey="value">
                {costDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CLUSTER_COLORS[index % CLUSTER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Performance Radar" icon={<Activity size={18}/>}>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={performanceData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" stroke="#64748b" />
              <PolarRadiusAxis stroke="#64748b" />
              <Radar name="Temperatura" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Radar name="Energia x10" dataKey="B" stroke="#10b981" fill="#10b981" fillOpacity={0.6} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ClustersTab({ mergedData, clusterStatsArray }) {
  return (
    <div className="clusters-tab">
      <div className="clusters-row">
        <ChartCard title="Análise de Clusters (K-Means)" icon={<Activity size={18}/>}>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" dataKey="temperatura" name="Temperatura" unit="°C" stroke="#64748b" />
              <YAxis type="number" dataKey="energia" name="Energia" unit="kWh" stroke="#64748b" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
              <Legend />
              <Scatter name="Carregamentos" data={mergedData}>
                {mergedData.map((entry, index) => (
                  <Cell key={index} fill={CLUSTER_COLORS[entry.cluster % CLUSTER_COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Distribuição por Cluster" icon={<BarChart3 size={18}/>}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChartR data={clusterStatsArray}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="cluster" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChartR>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="clusters-card-row">
        {clusterStatsArray.map((cluster, idx) => (
          <div key={idx} className="cluster-card">
            <div className="cluster-card-header">
              <h3>{cluster.cluster}</h3>
              <div className="cluster-color-dot" style={{ backgroundColor: CLUSTER_COLORS[idx % CLUSTER_COLORS.length] }}></div>
            </div>
            <div className="cluster-card-body">
              <div>
                <p className="cluster-label">Registos</p>
                <p className="cluster-num">{cluster.count}</p>
              </div>
              <div>
                <p className="cluster-label">Temp. Média</p>
                <p className="cluster-stat">{cluster.avgTemp}°C</p>
              </div>
              <div>
                <p className="cluster-label">Energia Média</p>
                <p className="cluster-stat">{cluster.avgEnergy} kWh</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab({ historyData }) {
  return (
    <div className="history-tab">
      <ChartCard title="Histórico Completo de Carregamentos" icon={<Database size={18}/>}>
        <div className="history-info">
          <p>Total de {historyData.length} carregamentos registados</p>
        </div>
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Temperatura</th>
                <th>Energia (kWh)</th>
                <th>Taxa (kW)</th>
                <th>Duração (h)</th>
                <th>Custo (€)</th>
                <th>Bateria (%)</th>
              </tr>
            </thead>
            <tbody>
              {historyData.slice().reverse().map((item, idx) => (
                <tr key={idx}>
                  <td>{item.id}</td>
                  <td>{new Date(item.timestamp).toLocaleString('pt-PT')}</td>
                  <td>{item.temperatura.toFixed(1)}°C</td>
                  <td>{item.energia.toFixed(2)}</td>
                  <td>{item.charging_rate.toFixed(2)}</td>
                  <td>{item.charging_duration.toFixed(2)}</td>
                  <td>{item.charging_cost.toFixed(2)}</td>
                  <td>
                    <div className="battery-bar-wrap">
                      <div className="battery-bar-bg">
                        <div
                          className="battery-bar-fill"
                          style={{ width: `${Math.min(100, parseFloat(item.battery_level_percent || 0))}%` }}
                        ></div>
                      </div>
                      <span className="battery-bar-label">{item.battery_level_percent || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
