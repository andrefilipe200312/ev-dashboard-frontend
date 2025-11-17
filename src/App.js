import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

const CLUSTER_COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#d0ed57"];

// 📌 O BROWSER tem de usar localhost, não o hostname Docker
const API_BASE_URL = "http://localhost:5000";

function App() {
  const [historyData, setHistoryData] = useState([]);
  const [mergedData, setMergedData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const historyUrl = `${API_BASE_URL}/api/history`;
        const clustersUrl = `${API_BASE_URL}/api/clusters`;

        const [historyRes, clustersRes] = await Promise.all([
          axios.get(historyUrl),
          axios.get(clustersUrl),
        ]);

        // Ordenar dados históricos por timestamp
        const sortedHistory = [...historyRes.data]
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .map((item) => ({
            ...item,
            // Converter features que o kmeans precisa
            temperatura: parseFloat(item.temperature_c),
            humidade: parseFloat(item.energy_consumed_kwh),
          }));

        setHistoryData(sortedHistory);

        // Criar mapa device_id → cluster
        const clusterMap = clustersRes.data.reduce((acc, row) => {
          acc[row.device_id] = row.cluster;
          return acc;
        }, {});

        // Associar cluster ao histórico pela coluna ID
        const joined = sortedHistory
          .map((item) => ({
            ...item,
            cluster: clusterMap[item.id], // <--- MATCH certo
          }))
          .filter(
            (item) =>
              item.cluster !== undefined &&
              !isNaN(item.temperatura) &&
              !isNaN(item.humidade)
          );

        setMergedData(joined);
      } catch (err) {
        console.error("❌ Erro ao buscar dados:", err);
      }
    };

    fetchData();
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>📊 Histórico de Carregamentos</h1>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={historyData}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(v) => (v ? new Date(v).toLocaleTimeString() : "")}
          />

          <YAxis />
          <Tooltip />
          <Legend />

          <Line type="monotone" dataKey="charging_rate_kw" stroke="#82ca9d" />
          <Line
            type="monotone"
            dataKey="charging_duration_hours"
            stroke="#8884d8"
          />
          <Line
            type="monotone"
            dataKey="charging_cost_eur"
            stroke="#ff7300"
          />
        </LineChart>
      </ResponsiveContainer>

      <h1 style={{ marginTop: "60px" }}>🔬 Visualização de Clusters (K-Means)</h1>

      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart>
          <CartesianGrid />

          <XAxis
            type="number"
            dataKey="temperatura"
            name="Temperature"
            unit="°C"
          />

          <YAxis
            type="number"
            dataKey="humidade"
            name="Energy Consumed"
            unit="kWh"
          />

          <Tooltip />
          <Legend />

          <Scatter name="Clusters" data={mergedData}>
            {mergedData.map((entry, index) => (
              <Cell
                key={index}
                fill={CLUSTER_COLORS[entry.cluster % CLUSTER_COLORS.length]}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default App;
