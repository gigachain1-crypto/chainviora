/* ==========================================================================
   GIGACHAIN - Charts & Financial Data Visualizations
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initTokenomicsChart();
  initStakingGrowthChart();
});

// 1. Tokenomics Donut Chart
let tokenomicsChartInstance = null;

function initTokenomicsChart() {
  const ctx = document.getElementById('tokenomicsChart');
  if (!ctx) return;

  const data = {
    labels: [
      'Staking Rewards (30%)',
      'Public Presale & IDO (25%)',
      'Ecosystem & Dev Grants (20%)',
      'Liquidity & DEX Reserves (15%)',
      'Core Team & Advisory (10%)'
    ],
    datasets: [{
      data: [30, 25, 20, 15, 10],
      backgroundColor: [
        '#D4AF37', // Gold
        '#FF007A', // Neon Pink
        '#00DFD8', // Bright Cyan
        '#7928CA', // Vivid Purple
        '#0070F3'  // Electric Blue
      ],
      borderColor: '#FFFFFF',
      borderWidth: 3,
      hoverOffset: 12
    }]
  };

  const config = {
    type: 'doughnut',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 14, weight: '700' },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13 },
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const totalTokens = 1000000000;
              const amount = ((value / 100) * totalTokens).toLocaleString();
              return ` ${label}: ${amount} GIGA`;
            }
          }
        }
      },
      animation: {
        animateScale: true,
        animateRotate: true,
        duration: 2000
      }
    }
  };

  tokenomicsChartInstance = new Chart(ctx, config);
}

// 2. Staking Growth Curve Chart
let stakingChartInstance = null;

function initStakingGrowthChart() {
  const ctx = document.getElementById('stakingChart');
  if (!ctx) return;

  const months = ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8', 'Month 9', 'Month 10', 'Month 11', 'Month 12'];
  const baseYield = [1015, 1032, 1050, 1069, 1089, 1110, 1132, 1155, 1179, 1204, 1230, 1258];

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(212, 175, 55, 0.45)');
  gradient.addColorStop(0.5, 'rgba(121, 40, 202, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 223, 216, 0.0)');

  const data = {
    labels: months,
    datasets: [{
      label: 'Compound Yield Value ($USD)',
      data: baseYield,
      borderColor: '#D4AF37',
      borderWidth: 3,
      pointBackgroundColor: '#FF007A',
      pointBorderColor: '#FFFFFF',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 7,
      fill: true,
      backgroundColor: gradient,
      tension: 0.4
    }]
  };

  const config = {
    type: 'line',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => ` Projected Value: $${ctx.raw.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: "'Plus Jakarta Sans'" }, color: '#64748B' }
        },
        y: {
          grid: { color: 'rgba(212, 175, 55, 0.12)' },
          ticks: {
            font: { family: "'Plus Jakarta Sans'" },
            color: '#64748B',
            callback: (val) => '$' + val
          }
        }
      }
    }
  };

  stakingChartInstance = new Chart(ctx, config);
}

// Update Staking chart dynamically when slider changes
window.updateStakingChartData = function (stakedAmount, apyRate) {
  if (!stakingChartInstance) return;

  const monthlyRate = Math.pow(1 + apyRate / 100, 1 / 12) - 1;
  const tokenPrice = 30.00; // Fixed GIGA token price ($30.00)
  const initialValue = stakedAmount * tokenPrice;

  const newData = [];
  let currentValue = initialValue;
  for (let i = 1; i <= 12; i++) {
    currentValue = currentValue * (1 + monthlyRate);
    newData.push(Math.round(currentValue));
  }

  stakingChartInstance.data.datasets[0].data = newData;
  stakingChartInstance.update();
};

