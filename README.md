# Tezos Network Statistics

A real-time statistics dashboard for the Tezos blockchain ecosystem, featuring glassmorphism design and smooth flip animations.

🌐 **Live Site:** [tezos.systems](https://tezos.systems)

## Features

- **Real-time Statistics**: Auto-refreshes every 18 seconds
- **Glassmorphism UI**: Modern frosted glass aesthetic
- **Smooth Animations**: 3D flip card effects on stat updates
- **Dark/Light Mode**: Toggle between themes with persistence
- **Multiple Data Sources**: Switch between TzKT API and Octez RPC
- **Responsive Design**: Mobile-friendly layout
- **Zero Dependencies**: Pure HTML/CSS/JavaScript

## Statistics Displayed

1. **Total Bakers** - Number of active validators on Tezos
2. **tz4 Consensus Bakers** - Bakers using tz4 consensus addresses
3. **tz4 Adoption** - Percentage of bakers migrated to tz4
4. **Total Issuance** - Current XTZ supply in circulation
5. **Transaction Volume** - Number of transactions in last 24 hours

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules)
- **Styling**: CSS3 with CSS Variables
- **APIs**:
  - [TzKT API](https://api.tzkt.io) - Baker data & statistics
  - [Tez.Capital RPC](https://eu.rpc.tez.capital) - Issuance data
- **Hosting**: GitHub Pages
- **Domain**: Custom domain via CNAME

## Project Structure

```
tezos.systems/
├── index.html       # Main HTML structure
├── styles.css       # Glassmorphism styles & animations
├── app.js          # Application orchestration
├── api.js          # API integration & data fetching
├── theme.js        # Theme management (dark/light)
├── animations.js   # Flip animation system
├── utils.js        # Utility functions & formatters
├── CNAME           # Custom domain configuration
└── README.md       # Documentation
```

## Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/[username]/tezos.systems.git
   cd tezos.systems
   ```

2. **Start a local server:**
   ```bash
   # Using Python 3
   python3 -m http.server 8000

   # Or using Python 2
   python -m SimpleHTTPServer 8000

   # Or using Node.js
   npx http-server -p 8000
   ```

3. **Open in browser:**
   ```
   http://localhost:8000
   ```

## API Usage

### TzKT API

```javascript
// Fetch active bakers
GET https://api.tzkt.io/v1/delegates?active=true&select=address,consensusKey

// Fetch transaction volume (24h)
GET https://api.tzkt.io/v1/operations/transactions?timestamp.ge={24h_ago}
```

### Octez RPC

```javascript
// Fetch total issuance
GET https://eu.rpc.tez.capital/chains/main/blocks/head/context/total_supply
```

## Customization

### Change Refresh Interval

```javascript
// In browser console
TezosStats.setRefreshInterval(30000); // 30 seconds
```

### Check API Health

```javascript
// In browser console
await TezosStats.checkHealth();
```

### Manual Refresh

```javascript
// In browser console
TezosStats.refresh();
```

## Browser Compatibility

- **Modern Browsers**: Full support with glassmorphism
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

- **Older Browsers**: Fallback to solid backgrounds
  - Automatic detection via `@supports` queries

## Performance

- **First Load**: < 2s
- **Auto-refresh**: Every 18s
- **API Response**: ~100-500ms (cached: < 10ms)
- **Animation Duration**: 600ms per card flip
- **Stagger Delay**: 100ms between flips

## Accessibility

- ✅ Keyboard navigation support
- ✅ ARIA labels on interactive elements
- ✅ Reduced motion preference respected
- ✅ High contrast mode support
- ✅ Semantic HTML structure

## Deployment

### GitHub Pages

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Update dashboard"
   git push origin main
   ```

2. **Enable GitHub Pages:**
   - Go to repository Settings
   - Navigate to Pages section
   - Source: Deploy from `main` branch
   - Folder: `/ (root)`

3. **Configure Custom Domain:**
   - Add DNS A records:
     - 185.199.108.153
     - 185.199.109.153
     - 185.199.110.153
     - 185.199.111.153
   - Or CNAME: `[username].github.io`
   - Enable HTTPS (automatic via Let's Encrypt)

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.

### Roadmap

- [ ] Historical charts for stats
- [ ] WebSocket for real-time updates
- [ ] PWA support (offline mode)
- [ ] Multi-language support
- [ ] Export stats as PNG/PDF
- [ ] Additional ecosystem metrics (DeFi, NFT)

## License

MIT License - feel free to use this project as a template for your own blockchain statistics dashboards.

## Credits

- **Data Sources**: [TzKT](https://tzkt.io) and [Tez.Capital](https://tez.capital)
- **Design Inspiration**: Glassmorphism trend in modern UI
- **Tezos Community**: For building an amazing ecosystem

## Links

- **Website**: [tezos.systems](https://tezos.systems)
- **TzKT Explorer**: [tzkt.io](https://tzkt.io)
- **Tezos**: [tezos.com](https://tezos.com)
- **Issues**: [GitHub Issues](https://github.com/[username]/tezos.systems/issues)

---

Built with ❤️ for the Tezos ecosystem
