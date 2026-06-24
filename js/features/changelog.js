/**
 * Changelog Modal
 * Displays version history and updates
 */

const CHANGELOG = [
    {
        date: '2026-06-23',
        entries: [
            { type: '🎨', text: 'Ledger Flow card labels now color sent pink and first-in gold to match the diagram legend' },
            { type: '✨', text: 'TzSafe Recovery now lives in the corner gift tray and Explore menu as the legacy KT1 multisig migration path for the community fork' },
            { type: '🔧', text: 'Playwright smoke and OG tooling now share one Chrome launcher with system-browser fallback so missing bundled Chromium no longer interrupts local QA' },
            { type: '✨', text: 'Protocol Anthology now keeps Read full history controls clickable, adds full-story printing, and animates governance clash markers across the living archive' },
            { type: '🔧', text: 'Ledger Flow counterparty cards now fit their labels and use My Tezos account links with compact TzKT pills throughout the diagram and selected path' },
            { type: '🎨', text: 'Ledger Flow and Protocol Anthology Chamber cards now reserve real footer space so their rails, controls, and Open actions no longer collide' },
            { type: '🎨', text: 'Mobile now scales the Tezos Systems wordmark wider across the header so it lines up more closely with the panels below' },
            { type: '🎨', text: 'The desktop uptime badge now hugs the uptime label while keeping compact two-digit number slots stable' },
            { type: '✨', text: 'Ledger Flow is now a Chamber for mapping sent, received, and first-funding account transfer paths with amount-weighted lines, with My Tezos linking saved addresses straight into it' },
            { type: '🎨', text: 'Mobile now keeps the Running on Tallinn chip beside the uptime pill with matching compact header styling' },
            { type: '🎨', text: 'The header uptime badge now uses a tighter fixed uptime slot so the visible separators read like two spaces' },
            { type: '🎨', text: 'The header uptime badge now anchors the since marker while keeping two-space visual separators' },
            { type: '🎨', text: 'The header uptime proof now uses Aurora teal-to-violet colors and theme-matched title, uptime, and stat pill palettes' },
            { type: '🔧', text: 'The command bar now labels wallet and .tez searches clearly and routes KT1 starter searches to contracts instead of bakers' },
            { type: '🎨', text: 'Mobile now gives the cycle number more room beside the gift tray' },
            { type: '🎨', text: 'Mobile now keeps the gift tray in the top-left price row while centering the Tezos Systems title stack' },
            { type: '🔧', text: 'Price Intelligence deep links now open even when live cycle metadata is slow to answer' },
            { type: '🔧', text: 'The first-visit tour now follows all eight steps cleanly after the larger Chambers and Loop Console layouts on desktop and mobile' },
            { type: '🎨', text: 'The header uptime proof now sits as a compact square-edged badge directly under Tezos Systems while the stat pills stay right-aligned' },
            { type: '🎨', text: 'The Zero Forks and Zero Outages badges are gone from the top header so Mainnet Uptime can read as one small live proof pill' },
            { type: '✨', text: 'The header uptime stat pills now open their own all-time history charts' },
            { type: '🎨', text: 'The tiny HEN and ctez corner launchers now live inside one gift tray that expands downward for current and future quick tools' },
        ]
    },
    {
        date: '2026-06-22',
        entries: [
            { type: '✨', text: 'Governance Alert now appears only during live voting windows with saved-baker vote checks, RSS access, and optional browser reminders' },
            { type: '⚡', text: 'Share and widget loops now add tracked Tezos Systems links, widget attribution, and GoatCounter events for share, governance, and embed-builder actions' },
            { type: '🔧', text: 'The AI plugin manifest now matches the actual freshness model and September 17, 2018 mainnet launch date' },
            { type: '🎨', text: 'Historical Data now has a direct #history copy link and share copy that points people back into the live chart surface' },
            { type: '🎨', text: 'Baker Report Card share copy now speaks directly to bakers and delegators without changing the existing scoring model' },
            { type: '🔧', text: 'Bubblegum now starts with visible drifting bubbles instead of waiting for off-screen bubbles to rise into view' },
            { type: '🔧', text: 'Chamber loading bars now animate in place so mobile rooms stay inside the viewport while data syncs' },
            { type: '🎨', text: 'The header uptime live signals now sit in larger individual pills for easier scanning' },
            { type: '🔧', text: 'The header uptime counter now keeps a fixed-width slot so minute changes do not nudge nearby network metrics' },
            { type: '🔧', text: 'Need Help now walks through the current uptime proof, block ticker, command bar, Chambers, My Tezos, Loop Console, Explore, and Settings surfaces with mobile-safe tour placement' },
        ]
    },
    {
        date: '2026-06-21',
        entries: [
            { type: '✨', text: 'Protocol Anthology now opens with a curator desk, archive evidence, featured long reads, and era shelves that route into real protocol histories' },
            { type: '🎨', text: 'The header uptime rail now stands out as a Mainnet Uptime banner with a large live counter and zero-fork proof stamps' },
            { type: '🔧', text: 'Tezos X Governance mobile Chamber cards now keep footer controls clear of live proposal content' },
            { type: '🔧', text: 'First-visit help now centers the command bar and stays optional, with search examples for early entrants and easy dismissal for returning users' },
            { type: '🎨', text: 'The Tezos Loop Console now doubles as a search recipe guide with wallet, baker, contract, governance, NFT, and market examples' },
            { type: '🔧', text: 'Protocol History Chamber now exposes View Timeline and View Impact controls at the top of the anthology instead of burying them below the timeline' },
            { type: '✨', text: 'The header uptime rail now decrypt-shuffles changed values for 1.5 seconds and opens Historical Data when clicked' },
            { type: '🎨', text: 'The header uptime rail now starts with full uptime, then green zero-fork and zero-outage proof badges, then live stats' },
            { type: '🎨', text: 'The front-page uptime proof is now a borderless header rail instead of a large continuity card' },
            { type: '🎨', text: 'The zero-fork continuity proof now sits beside the Tezos Systems identity with live bakers, finality, staked share, and issuance before the command bar' },
            { type: '🎨', text: 'The duplicate recruit cards and footer aura prompt are now one Tezos Loop Console with persona lanes, command-bar seeds, and direct next-step routes' },
            { type: '🎨', text: 'Protocol History now appears in Chambers as a Protocol Anthology card with current chapter, lore, impact, memory, and recent protocol spines' },
            { type: '🎨', text: 'The live block ticker and Network Health entry card are clean again, with uptime and zero-outage proof moved into a dedicated Continuity Proof panel inside the Network Health Chamber' },
            { type: '🎨', text: 'The command deck is now pure search, with the Running on Tallinn header chip launching Protocol History instead of repeating protocol copy above the bar' },
            { type: '✨', text: 'Protocol History now opens current-first from Tallinn and folds backward through prior protocol eras inside its Chamber' },
            { type: '🔧', text: 'Active search now transforms the page into a focused retrieval mode so Chambers recede behind the command surface instead of overlapping it' },
        ]
    },
    {
        date: '2026-06-20',
        entries: [
            { type: '✨', text: 'Protocol History is now a full Chamber with the timeline, protocol lore, sharing, and impact views preserved behind #protocol-history' },
            { type: '✨', text: 'The front page now opens with a command deck: Running on Tallinn, live block ticker, primary search, Chambers, and persona loops before the protocol archive' },
            { type: '✨', text: 'The command bar now treats My Tezos as a retrieval surface for wallets, .tez names, bakers, Chambers, protocol lore, and dashboard commands' },
            { type: '✨', text: 'The living uptime panel now shows live annual issuance beside bakers, finality, and staked share' },
            { type: '✨', text: 'The live block ticker now shows the latest baker Octez version between Health and Attested so upgrade readiness is visible at a glance' },
            { type: '✨', text: 'Tezos vs Other Chains now opens with a standing summary for where Tezos, Ethereum, Solana, Cardano, and Algorand each lead or lag' },
        ]
    },
    {
        date: '2026-06-19',
        entries: [
            { type: '✨', text: 'Network Context chips, header links, and ranked cards now open the matching My Tezos, price, staking, governance, NFT, whale, history, and health features' },
            { type: '⚡', text: 'My Tezos address refresh now overlaps operator-status checks with the rest of the drawer brief so address switches publish faster' },
            { type: '🎨', text: 'The tz4 Adoption and Liquidity Baking cards now share the same compact Chambers row height so their edges line up cleanly' },
            { type: '🎨', text: 'The Liquidity Baking monitor card now keeps its latest baker vote tape beside the EMA summary so the Chambers row stays compact' },
            { type: '✨', text: 'The Liquidity Baking monitor card now shows a compact live tape of the latest baker ON, OFF, and PASS toggle votes' },
            { type: '🎨', text: 'Historical Data now shows a compact quiet-state explanation when governance participation has no ballot samples instead of leaving an empty chart panel' },
            { type: '✨', text: 'Your Tezos Story now reads like a personal Tezos dossier with identity, archetype, milestones, protocol-era trail, and a live next-signal panel' },
            { type: '✨', text: 'Network Context now ranks daily signals as personalized cards using baker, portfolio, staking, governance, collector, and creator focus chips' },
            { type: '🔧', text: 'My Tezos now colors baker Octez versions yellow when they trail the latest observed release and red when they are a major line behind' },
            { type: '✨', text: 'My Tezos now shows the TzKT-reported Octez version for bakers in the live signal and My Baker stats' },
            { type: '✨', text: 'Network Health now tracks TzKT-reported Octez baker versions by baking power and flags the largest bakers not on the latest observed release' },
            { type: '🔧', text: 'Consensus Lens now uses the latest complete Teztale consensus sample for quorum timing and labels newer heads that are still collecting attestation data' },
            { type: '✨', text: 'Network Health now adds a Teztale-powered Consensus Lens for quorum timing, validation delay, source count, and simple operations reporting with Nomadic Labs credit' },
            { type: '🔧', text: 'Tezos X Governance now says No Proposal during quiet L2 periods instead of using track jargon on the front card' },
            { type: '🔧', text: 'Embed Widgets now share the dashboard theme, endpoint, retry, cache, and catalog runtime, with Combo Strip options for head freshness and tz4 power adoption' },
            { type: '✨', text: 'Historical Data now opens with a captured-signal digest for tz4 power, staking, Liquidity Baking, market, Network Health, Tezos X, and governance-period history' },
            { type: '✨', text: 'Network Health now monitors TzKT cyclic cycle-time drift so unusually slow or fast cycles are visible in the Health chamber' },
            { type: '✨', text: 'Staking APY, delegated stake, total burned, and baking power cards now get sparkline history and direct chart controls from expanded Supabase rows' },
            { type: '🔧', text: 'Daily Briefing price copy now uses live CoinGecko 24-hour movement and refreshes same-cycle cache when market conditions change' },
            { type: '✨', text: 'A live block ticker now sits as its own island between Current Protocol and Chambers with latest block, compact baker names, stable-width health telemetry, and a clean whole-line transition' },
            { type: '🎨', text: 'Front-page panel borders now sit softer at rest while Chamber cards keep a sharper colored edge on hover' },
            { type: '🎨', text: 'The aurora title now keeps the same slow color-shift treatment on desktop and mobile even when global motion settings are conservative' },
            { type: '🎨', text: 'The footer now has a playful Tezos aura checkpoint that routes bottom-scrollers into widgets, My Tezos, HEN, the Chamber, or price intel' },
            { type: '🎨', text: 'Footer attribution and resource links now sit in a tighter balanced layout with clearer hierarchy and calmer build metadata' },
            { type: '🎨', text: 'Footer chamber links now expose every public Chamber route while the Tez Capital credit gets a little more breathing room' },
        ]
    },
    {
        date: '2026-06-18',
        entries: [
            { type: '✨', text: 'Chamber stats buttons now open the matching historical series for Network Health, LB EMA, Tezos X TVL, L1 governance participation, and tz4 power adoption' },
            { type: '✨', text: 'The History modal now charts expanded Supabase fields including total staked, stake APY, tz4 power, protocol issuance, and Liquidity Baking EMA' },
            { type: '✨', text: 'The History modal now includes Chamber history charts for market, Network Health, Tezos X, and governance-period snapshots from Supabase' },
            { type: '🔧', text: 'Supabase history capture now has a freshness check and visible capture-status strip for global and Chamber domain tables' },
            { type: '⚡', text: 'GitHub Actions workflows now use Node 24-era action pins for data collection, backfill, and generated governance refreshes' },
            { type: '⚡', text: 'A manual Supabase backfill workflow can now repair older history rows from timestamped TzKT statistics and archival Octez issuance state' },
            { type: '⚡', text: 'A 30-minute chamber history collector now snapshots market, Network Health, Tezos X, and L1 governance-period state into Supabase domain tables' },
            { type: '⚡', text: 'Historical capture now has a tracked Supabase migration for expanded staking, Liquidity Baking, tz4 power, market, health, governance, and Tezos X history fields' },
            { type: '🎨', text: 'Chamber card stats controls now sit at the bottom of the vertical icon rail below share, direct-link, and info actions' },
            { type: '🎨', text: 'The L1 governance room is now labeled Tezos L1 Governance, while the Tezos X Governance card explicitly notes that it is L2 Governance' },
        ]
    },
    {
        date: '2026-06-17',
        entries: [
            { type: '🔧', text: 'My Tezos wallet disconnect now clears locally if Octez.Connect does not answer, so the drawer no longer gets stuck on a disconnecting message' },
            { type: '🔧', text: 'My Tezos now refreshes the brief, rewards, header, and baker stat grid together when the drawer opens' },
            { type: '🔧', text: 'Mobile Liquidity Baking baker links now wrap instead of clipping inside narrow vote tables' },
            { type: '🔧', text: 'The top price bar once again shows the XTZ 24-hour change beside the live price' },
            { type: '🔧', text: 'Full protocol timeline sharing now attaches to the upgrade header when the older badge rail is absent' },
            { type: '🔧', text: 'The build footer keeps its latest-main slot visible even when GitHub rate-limits the live commit lookup' },
            { type: '🔧', text: 'First-visit tour copy now matches the current 13-theme picker' },
            { type: '🔧', text: 'Smoke coverage now lists suites from the executable catalog and clicks more share-photo buttons across leaderboard, protocol history, and share-action surfaces' },
        ]
    },
    {
        date: '2026-06-16',
        entries: [
            { type: '🎨', text: 'Current Protocol no longer shows the compact Chamber prompt; Adoption runway context now lives on the wider Chamber card with activation timing' },
            { type: '🎨', text: 'Chamber card share images now include the visible Chamber panel snapshot with live summary rows instead of only a bare headline and value' },
            { type: '🎨', text: 'Every Chamber card now gets consistent SVG share and info controls, including late-rendered Tezos X, governance, and Chamber entry cards' },
            { type: '🎨', text: 'Chamber card controls now stack vertically so camera, direct-link, and info icons stay clear of live preview rows' },
            { type: '🔧', text: 'tz4 Adoption now clears stale modal rows on reopen so refreshed content and the live timer start together' },
            { type: '🎨', text: 'The Chamber now explains quiet governance states with a top-level Now panel, latest vote receipt, next milestone, and failed-vote memory instead of leaving no-ballot periods feeling empty' },
            { type: '🔧', text: 'My Tezos baker signal now refreshes live while the drawer is open so resolved attestation issues clear without a manual reload' },
            { type: '🎨', text: 'Front-page Chamber cards now use denser rows, tighter mobile previews, and cleaner utility-control spacing' },
            { type: '✨', text: 'ctez End of Life now previews the selected oven close plan and submits burn plus withdraw legs in one Octez.Connect wallet batch when both are needed' },
            { type: '🎨', text: 'ctez End of Life now uses native Tezos.Systems chamber styling with live recovery panels, mono plan rows, and community reference links' },
            { type: '🎨', text: 'My Tezos wallet and manual address actions now use clearer labels so the drawer no longer presents two similar connect buttons' },
            { type: '🎨', text: 'ctez End of Life now stays out of default Chambers and opens from Explore or the tiny top-left ctez launcher' },
            { type: '🎨', text: 'ctez Recovery now mirrors the retired app with a calmer My Ovens summary, oven rows, and detail cards while keeping automatic wallet detection' },
            { type: '🎨', text: 'ctez Recovery now detects owned ovens automatically and hides manual recovery steps from users' },
        ]
    },
    {
        date: '2026-06-15',
        entries: [
            { type: '🎨', text: 'ctez Recovery was added to Chambers as a focused old-oven recovery surface with direct access from the dashboard' },
            { type: '🔧', text: 'Octez.Connect wallet loading now uses a CSP-safe prewarmed ESM bundle so My Tezos and ctez wallet actions can open the dApp client' },
            { type: '🎨', text: 'Current Protocol now shows only a compact Chamber signal while detailed governance progress stays inside The Chamber' },
            { type: '🔧', text: 'My Tezos baker signal now ignores nonzero-round baking rights and shows a back-online state as soon as fresh attestations are realized' },
            { type: '✨', text: 'ctez Recovery supports Octez.Connect wallet requests for mint_or_burn and withdraw oven operations' },
            { type: '✨', text: 'My Tezos now has an Octez.Connect wallet path that syncs the connected account into the drawer without removing manual address entry' },
            { type: '✨', text: 'ctez Recovery joins Chambers with safety reminders for users recovering tez from old ctez ovens' },
            { type: '🔧', text: 'Governance lore now covers Ushuaia Adoption with DAL, rollup, sTEZ, and tz5 context so the live protocol refresh stays unblocked' },
            { type: '🔧', text: 'My Tezos smoke coverage now exercises regular delegators and mostly-staked user accounts, not only bakers' },
        ]
    },
    {
        date: '2026-06-14',
        entries: [
            { type: '🔧', text: 'My Tezos rewards now use personal staker reward rows and clearer baker missed-right labels' },
            { type: '🔧', text: 'Objkt profile reads now page past the 500-row API cap so large creator and collector wallets count correctly' },
            { type: '✨', text: 'My Tezos Story now shows compact Objkt creator stats and drops the governance-cycle line from the share card' },
            { type: '✨', text: 'My Tezos Story now includes a reverse .tez domain alias when one exists for the address' },
            { type: '✨', text: 'My Tezos Story now includes the number of NFTs an address has collected, using distinct Objkt-held assets' },
            { type: '🔧', text: 'NFT Profile collector collections now default to distinct asset counts instead of raw edition quantities for high-supply tokens' },
            { type: '🎨', text: 'Mobile landing theme cards now wrap into a two-column grid and stay inside the viewport' },
            { type: '🔧', text: 'Smoke tests now check public routes, widget pages, and the 404 screen for desktop/mobile formatting overflow' },
            { type: '🔧', text: 'The 404 screen now declares the Tezos Systems favicon like the other standalone pages' },
            { type: '✨', text: 'Direct account paths like /tz1... and /name.tez now resolve straight into My Tezos with stale saved addresses overridden' },
        ]
    },
    {
        date: '2026-06-13',
        entries: [
            { type: '🔧', text: 'My Tezos Story now attributes accepted protocol proposals to the actual injector instead of crediting a delegator for a proposal from their baker' },
            { type: '🔧', text: 'My Tezos address edits now save over a stale connected baker instead of copying the old address' },
            { type: '🔧', text: 'Tezos X now uses #tezosx and /tezosx/ as its primary direct links while legacy #tezlink still opens the chamber' },
            { type: '🔧', text: 'The L2 governance chamber is now labeled Tezos X Governance while preserving the existing #l2chamber direct link' },
            { type: '🔧', text: 'The L2 chamber is now labeled Tezos X across the dashboard card, modal, share route, and network copy' },
        ]
    },
    {
        date: '2026-06-12',
        entries: [
            { type: '🔧', text: 'Chamber open buttons now come from one app-shell template and sit in the same footer position across all live room cards' },
            { type: '🎨', text: 'Tezos X and tz4 chamber polish now keeps mobile TVL copy together, fills quiet direction cells, and lets holdout baker names wrap' },
            { type: '🎨', text: 'tz4 Adoption now shows visible monthly switch counts with reliable bar heights and expands First Movers to the top 10 bakers' },
            { type: '🎨', text: 'Chamber cards now use an in-flow freshness footer and keep live vote metrics, Tezos X titles, L2 timelines, and tz4 month bars readable across tablet and mobile widths' },
            { type: '🎨', text: 'Aurora title now uses the same shifting multicolor wordmark on desktop and mobile' },
            { type: '🎨', text: 'Chamber card controls now reserve a top-right lane so copy, share, info, and open buttons stay clear of live preview content' },
            { type: '🔧', text: 'Governance RSS now keeps active proposal names in historical feed items, lazy theme cache stamps are guarded, and Liquidity Baking block ranges stay compact' },
            { type: '✨', text: 'Each live chamber now has a public share route with its own title, description, canonical URL, and 1200x630 social card' },
            { type: '✨', text: 'The governance pipeline now publishes an RSS feed and refreshes Chamber routes, OG cards, and static compare pages on schedule' },
            { type: '⚡', text: 'Compare pages now ship crawlable static scoreboards and summaries before the live enhancement script hydrates them' },
            { type: '⚡', text: 'Inactive theme overrides now live in lazy-loaded theme CSS bundles instead of the initial render-blocking stylesheet' },
            { type: '⚡', text: 'TzKT request pacing now covers SEO landing pages, standalone compare pages, and TzKT-backed widgets in addition to the main dashboard' },
            { type: '⚡', text: 'Current governance-period reads now share a short-lived core snapshot and TzKT 429 Retry-After handling also understands HTTP-date headers' },
            { type: '⚡', text: 'Remaining TzKT-backed chamber helpers now share the core Retry-After-aware fetch path without the one-minute memory cache on live pollers' },
            { type: '✨', text: 'Proposal Intel now shows live Ushuaia context bullets covering DAL throughput, rollup PVM activation, and testnet-only staking/key trials' },
            { type: '🎨', text: 'Chamber freshness stamps turn amber when their source timestamp falls behind the expected refresh window' },
            { type: '🔧', text: 'Chamber freshness now rechecks from wall-clock time so failed refreshes can turn stale, while Network Health separates data freshness from block age' },
            { type: '🔧', text: 'First-time visitors now land on the live dashboard, production debug logs are gated, and Liquidity Baking forecast metrics use compact labels' },
            { type: '🔧', text: 'Network Health refresh now follows block pulses first, with the interval acting only as a stale-pulse fallback' },
            { type: '🎨', text: 'The Chamber live vote chips use shorter mid-width-safe labels, and tz4 Adoption stamps freshness from the chain head time' },
        ]
    },
    {
        date: '2026-06-11',
        entries: [
            { type: '🔧', text: 'The Chamber share image now exports a branded 1200x630 Tezos Systems frame with proposal, vote metrics, date, and direct link baked into the pixels' },
            { type: '🔧', text: 'Homepage and landing metadata now use search-oriented Tezos dashboard copy, and sitemap coverage now includes SEO pages plus widget endpoints' },
            { type: '🎨', text: 'Network Health now gives the bottom-left freshness stamp more room and uses slimmer block-status pills in the wide Chambers card' },
            { type: '🔧', text: 'Removed the Chambers Daily Signal strip so the live room cards lead the section directly' },
            { type: '✨', text: 'Chambers now add trust-layer intelligence across the six live rooms: proposal intel, gap analysis, track memory, period telemetry, L2 direction, LB drift, and tz4 momentum' },
            { type: '✨', text: 'Tezos X now includes 30-day direction, L1 rollup anchor metadata, gas oracle detail, and top-token holder rows inside the chamber' },
            { type: '✨', text: 'Liquidity Baking and tz4 Adoption now expose sampled forecast/history layers, vote-change or holdout feeds, and clearer operator momentum signals' },
            { type: '🎨', text: 'Cache-free chamber QA tightened the tz4 live preview spacing and keeps Liquidity Baking help popovers inside mobile and desktop viewports' },
            { type: '🎨', text: 'Tezos X Governance quiet-state chips now stay clear of the bottom-left freshness stamp' },
            { type: '🎨', text: 'Live chamber cards now show quiet UTC freshness stamps without crowding their direct-link and open controls' },
            { type: '🔧', text: 'Dashboard refresh now keeps shared feature safety wrappers available during manual and background refresh cycles' },
            { type: '🎨', text: 'Liquidity Baking EMA trend lines now auto-scale around the recent range, and Tezos X Governance card controls avoid crowding track chips' },
            { type: '🔧', text: 'Tezos X Governance period countdowns now advance from the current head block instead of sticking at rollover copy' },
            { type: '🔧', text: 'Network Health chamber card controls now keep camera, direct link, and info buttons in separate top-right slots' },
            { type: '🎨', text: 'Network Health and Liquidity Baking chamber cards now keep compact status rows inside the card frame at wide desktop sizes' },
            { type: '🎨', text: 'Chambers now render as three paired rows so wide cards keep their companion card instead of leaving visual gaps' },
            { type: '✨', text: 'The Chamber card and modal now show live proposal context, refresh every minute, expose vote sharing, and keep live vote data before process explainers' },
            { type: '🎨', text: 'Network Health, Tezos X, Tezos X Governance, Liquidity Baking, and tz4 cards now use clearer live tapes, meters, idle chips, and mobile-safe previews' },
            { type: '🔧', text: 'Chamber theme colors, vote labels, historical turnout bars, tz4 baker rows, and Liquidity Baking disabled-state semantics were tightened after a full chamber audit' },
            { type: '🎨', text: 'Aurora title now keeps its shifting multicolor treatment visible on desktop instead of reading as a mostly static blue wordmark' },
            { type: '⚡', text: 'TzKT API calls now pass through a browser-local queue capped at six request starts per second to avoid visitor-side 429 bursts' },
        ]
    },
    {
        date: '2026-06-10',
        entries: [
            { type: '🔧', text: 'Chambers grid now keeps Network Health with The Chamber, Tezos X with Tezos X Governance, and tz4 Adoption with LB Monitor' },
            { type: '✨', text: 'tz4 Adoption now uses a wide Chambers tile with latest baker switches, pending activations, and the full queue in the opened chamber' },
            { type: '✨', text: 'Tezos X Governance track tabs now show recent historical proposal submissions for FAST, SLOW, and Sequencer' },
            { type: '🔧', text: 'Network Health chamber refreshes now update block rows in place so the 6-second live feed stays smooth' },
            { type: '🔧', text: 'Tezos X Governance now discovers active contracts from TzKT, keeps empty proposal shells compact, and labels the quiet state IDLE' },
        ]
    },
    {
        date: '2026-06-09',
        entries: [
            { type: '✨', text: 'Tezos X Governance Chamber added with #l2chamber access plus FAST, SLOW, and Sequencer track status from live TzKT contract storage' },
        ]
    },
    {
        date: '2026-06-08',
        entries: [
            { type: '🔧', text: 'Social preview image generation now falls back to local Chrome when Playwright\'s bundled browser is unavailable' },
        ]
    },
    {
        date: '2026-06-07',
        entries: [
            { type: '✨', text: 'Tezos X Chamber added with atomic L2 TVL, transaction, gas, address, and protocol TVL data sourced from current Etherlink rails' },
            { type: '✨', text: 'Network Health now earns a double-width Chambers tile with a live 1,000+ XTZ activity tape' },
            { type: '🔧', text: 'The Chamber card now expands during active ballot periods and shows time left, quorum, Yay threshold, and ballot context' },
            { type: '🔧', text: 'Staking ratio and APY now match TzKT Proof-of-Stake totals across dashboard, widgets, and share surfaces' },
            { type: '🔧', text: 'Sparkline cards now end on the same latest live values shown by their dashboard tiles' },
        ]
    },
    {
        date: '2026-06-06',
        entries: [
            { type: '🎨', text: 'Mobile Chamber vote rows now keep baker, timestamp, choice, and turnout details in distinct readable lines' },
            { type: '✨', text: 'The Chamber now shows current-stage ballots in chronological order before the broader historical context' },
            { type: '✨', text: 'The Chamber now includes a full chronological governance vote log from Athens through the latest local vote history' },
            { type: '🔧', text: 'tz4 Adoption and Network Health chamber cards now expose direct #tz4 and #health link controls' },
            { type: '🔧', text: 'Network Health chamber freshness now ages from the head block timestamp so stalled blocks do not look freshly updated' },
            { type: '🔧', text: 'Liquidity Baking Monitor now refreshes on the 6-second block cadence while open' },
            { type: '🎨', text: 'Mobile landing, upgrade proof, and chamber headings now use stronger solid contrast for Brave/WebKit rendering' },
            { type: '✨', text: 'Network Health now shows a compact My Tezos baker summary when a baker is saved' },
            { type: '🔧', text: 'First-visit dashboards now show the protocol panel plus a default Chambers section, with Network Stats hidden until enabled from Explore' },
            { type: '🔧', text: 'The Chamber, Liquidity Baking, tz4 Adoption, and Network Health now share one Chambers launcher toggle instead of separate Explore rows' },
            { type: '✨', text: 'Network Health is now an expandable #health chamber with live block cadence, round, missed attestation, and missed block detail' },
            { type: '🔧', text: 'The Chamber card keeps direct #chamber access while Explore now treats all chambers as one feature' },
        ]
    },
    {
        date: '2026-06-05',
        entries: [
            { type: '🔧', text: 'My Tezos baker capacity now shows over-delegation above 100% with signed free capacity instead of clamping to 100% and 0 free' },
            { type: '✨', text: 'My Tezos now gives bakers a top-line operator signal with next block ETA, fresh block/attestation health, and prominent DAL status' },
        ]
    },
    {
        date: '2026-06-04',
        entries: [
            { type: '✨', text: 'tz4 Adoption Chamber added with direct #tz4 access, your-baker status, pending switches, and first-mover timing' },
            { type: '🔧', text: 'Dead-code cleanup removed the disabled mobile tabs subsystem and stale helper exports without changing active dashboard flows' },
            { type: '⚡', text: 'Historical charts now paint 30d, 90d, and all-time views faster with bounded render points and coarse long-range ticks' },
            { type: '🎨', text: 'Governance vote panels no longer repeat quorum and supermajority status below the ballot breakdown' },
            { type: '🎨', text: 'Visit streak notifications now follow the active theme and pop in with a brighter spring entrance' },
            { type: '🎨', text: 'Governance vote panels now put the Chamber summary at the top-left, remove the old time bar, and avoid duplicate path metrics' },
            { type: '🎨', text: 'Desktop live-governance prompts now sit centered with compact time, quorum, supermajority, and ballot context' },
            { type: '🎨', text: 'Mobile live-governance prompts now keep the Chamber action compact instead of squeezing copy into vertical columns' },
            { type: '🎨', text: 'Since-last-visit popups now inherit the active theme instead of falling back to Matrix-style green chrome' },
        ]
    },
    {
        date: '2026-06-03',
        entries: [
            { type: '🎨', text: 'The compact Chamber prompt no longer repeats the vote-panel countdown, leaving more room for vote context' },
            { type: '✨', text: 'My Tezos now shows bakers their latest delegators and stakers from the last 14 days' },
            { type: '🎨', text: 'The active governance Chamber prompt now sits inside the live vote panel instead of repeating as a top-page banner' },
            { type: '✨', text: 'Per-card history charts now open on 30 days and can redraw at 7d, 30d, 90d, or all-time ranges' },
            { type: '🔧', text: 'Pre-commit now guards README sync when staged changes touch documented tooling, hook, theme, cache, route, widget, or app-shell behavior' },
            { type: '🔧', text: 'README and site metadata now agree with the current 13-theme, 9000-port, npm-tooling, smoke-test, hook, and cache-versioning setup' },
            { type: '🔧', text: 'Smoke testing now includes portable CLI suites plus app-shell checks for service worker, cache stamps, version metadata, manifest, icons, and routes' },
            { type: '🔧', text: 'Project setup now keeps the npm lockfile available so fresh clones can use reproducible npm ci tooling with the shared hook wrapper' },
            { type: '🎨', text: 'Liquidity Baking protocol-history lore now starts collapsed behind an arrow so live status stays front and center' },
            { type: '🎨', text: 'Dashboard card values are now slightly smaller across themes so sparklines have more room to breathe' },
            { type: '✨', text: 'Expanded Chamber and Liquidity Baking panels now show their direct links in the footer for easy bookmarking' },
            { type: '✨', text: 'The Chamber now explains the governance process and shows start/end dates plus duration for each dated stage' },
            { type: '🔧', text: 'Direct #lb and #chamber visits now skip onboarding without consuming the first root-site landing visit' },
            { type: '🎨', text: 'The Chamber phase tracker now uses arrowed connectors on desktop and mobile instead of stray dash marks' },
            { type: '✨', text: 'Liquidity Baking dashboard now explains LB with contextual tooltips and protocol-history lore from Granada, Ithaca, and Jakarta' },
            { type: '✨', text: 'Direct links now open The Chamber and land on the Liquidity Baking dashboard tile' },
        ]
    },
    {
        date: '2026-06-02',
        entries: [
            { type: '🔧', text: 'Live vote tally now reads early-window low turnout as on-track for the deadline instead of flashing a quorum warning' },
            { type: '🔧', text: 'The Chamber now shows the active proposal name (e.g. Ushuaia) instead of a raw hash while a vote is live' },
            { type: '⚡', text: 'Live vote tally now uses the cached, rate-limit-resilient data path so it survives TzKT 429s' },
            { type: '🔧', text: 'Governance participation now comes from a single canonical source to avoid mismatched numbers' },
            { type: '🎨', text: 'Chain comparison now sits below the live network stats so on-chain proof leads' },
            { type: '🔧', text: 'Consensus finality copy now consistently reads ~12s (final after 2 blocks)' },
            { type: '🔧', text: 'Governance banner is now keyboard-accessible (Enter/Space) and screen-reader labeled' },
            { type: '🔧', text: 'Share modals now sanitize picker text, clean up failed captures, and render reliably across mobile and newer themes' },
            { type: '🔧', text: 'State of Tezos snapshots now resolve active proposal names and current XTZ price correctly' },
            { type: '🔧', text: 'Protocol timeline now falls back to local governance metadata and expires old browser protocol caches' },
        ]
    },
    {
        date: '2026-06-01',
        entries: [
            { type: '✨', text: 'Liquidity Baking Monitor added with live EMA status, recent block votes, and baker latest-vote filters' },
            { type: '✨', text: 'Liquidity Baking Monitor now auto-refreshes while open and links baker names to Tezos.Systems and TzKT' },
            { type: '🎨', text: 'Liquidity Baking Monitor visual treatment softened with a cleaner Tezos.Systems header and calmer panels' },
            { type: '🔧', text: 'Liquidity Baking EMA status now explains the 50% disable threshold instead of showing the raw protocol accumulator' },
            { type: '🎨', text: 'Liquidity Baking live refresh now updates dials and rows in place instead of repainting the whole monitor' },
            { type: '🔧', text: 'Liquidity Baking dashboard card EMA now refreshes every minute while the page is visible' },
            { type: '🔧', text: 'My Baker lookup now shows the baker latest Liquidity Baking toggle vote from their most recent block' },
            { type: '🔧', text: 'Issuance card now excludes Liquidity Baking when the LB subsidy is disabled and labels LB as 0%' },
            { type: '🔧', text: 'Issuance references, exports, landing stats, and historical snapshots now reflect whether the Liquidity Baking subsidy is active' },
        ]
    },
    {
        date: '2026-05-26',
        entries: [
            { type: '🔧', text: 'Baker count and tz4 adoption now use current baking-power bakers and active consensus keys, matching All Bakers Attest activation math' },
        ]
    },
    {
        date: '2026-05-23',
        entries: [
            { type: '🔧', text: 'All-time history charts now page through Supabase results instead of stopping after the first 1,000 snapshots' },
        ]
    },
    {
        date: '2026-05-20',
        entries: [
            { type: '🔧', text: 'Staking ratio now counts XTZ still frozen in staking until unstakes finalize, and historical deltas use percentage points' },
        ]
    },
    {
        date: '2026-05-18',
        entries: [
            { type: '🔧', text: 'Testing/Cooldown governance now shows completed Exploration results without pretending a live ballot is still open' },
        ]
    },
    {
        date: '2026-05-16',
        entries: [
            { type: '🔧', text: 'Comparison share cards now reuse the same screenshot module instance as dashboard and card sharing' },
            { type: '🔧', text: 'HEN mode startup no longer uses document.write, removing the browser warning on direct HEN links' },
            { type: '🔧', text: 'User-facing launch-date copy now uses Sep 17, 2018 consistently across uptime, schema, and share templates' },
            { type: '🔧', text: 'Static and smoke tests now guard more individual feature workflows from regressing' },
            { type: '✨', text: 'Economy now includes Baking Power and Reward Accounts tiles for consensus weight and staking participation' },
        ]
    },
    {
        date: '2026-05-15',
        entries: [
            { type: '✨', text: 'Network Activity and Ecosystem now include New Accounts and Active Contracts cards for fresher usage signals' },
        ]
    },
    {
        date: '2026-05-14',
        entries: [
            { type: '🎨', text: 'Active governance spotlight now uses its empty right side for a compact five-stage process rail and live Chamber summary stats' },
            { type: '🔧', text: 'My Tezos baker vote status now reads current TzKT voter rows directly and reports live governance participation correctly' },
        ]
    },
    {
        date: '2026-05-13',
        entries: [
            { type: '✨', text: 'Tiny HEN launcher added to the top-left corner for immediate live art mode access' },
            { type: '🔧', text: 'HEN mode close control now exits the gallery directly' },
        ]
    },
    {
        date: '2026-05-12',
        entries: [
            { type: '✨', text: 'Active Exploration and Promotion votes now take center stage with a larger front-page governance spotlight' },
            { type: '🎨', text: 'Governance vote spotlight now has tighter visual polish and compact emoji cues for ballots, quorum, and supermajority' },
            { type: '🔧', text: 'Upgrade Clock vote details stay visible during active governance so quorum and supermajority context is easier to find' },
        ]
    },
    {
        date: '2026-05-06',
        entries: [
            { type: '🔧', text: 'Share tweet templates now cover Network Health, use live stat values, and avoid stale comparison claims' },
            { type: '⚡', text: 'Governance data now has one refresh command that updates vote history and stale-data audit artifacts before commits' },
            { type: '🔧', text: 'Protocol timeline highlights now read from protocol-data lore instead of duplicate hardcoded JavaScript maps' },
            { type: '🔧', text: 'Live governance cards now resolve active proposal epochs from TzKT and normalize Yay/Nay/Pass vote statuses' },
            { type: '🔧', text: 'The Chamber historical context now uses local governance vote history and includes every failed exploration and promotion vote' },
            { type: '✨', text: 'The Chamber now shows a 20-row governance vote view with passed, active, and failed period outcomes' },
        ]
    },
    {
        date: '2026-05-05',
        entries: [
            { type: '🔧', text: 'The Chamber historical context now loads recent governance votes from TzKT and protocol-data instead of hardcoded labels' },
            { type: '🔧', text: 'The Chamber now pins and restores page scroll while its modal is open so wheel gestures stay inside the war room' },
            { type: '🎨', text: 'The Chamber motion now uses calmer breathing glows and gentler panel animations' },
            { type: '🔧', text: 'Historical Context now lists recent previous governance votes newest first' },
            { type: '🔧', text: 'The Chamber modal now keeps scrolling inside the war room instead of moving the page behind it' },
        ]
    },
    {
        date: '2026-05-02',
        entries: [
            { type: '✨', text: 'Network Health card added to Consensus with last 5 block attestation power and 24h/7d/31d health windows' },
            { type: '✨', text: 'Explore launcher groups tools by goal with direct-link copy buttons for major features' },
            { type: '🎨', text: 'Clean theme contrast pass for uptime clock, comparison cards, share picker, and onboarding surfaces' },
            { type: '🔧', text: 'Widget Gallery demoted into a hidden builder-led embed utility so raw widget endpoints no longer occupy the default dashboard' },
            { type: '🔧', text: 'First-visit tour now starts from a non-blocking prompt instead of covering the dashboard immediately' },
            { type: '🔧', text: 'Deep links now reveal and scroll to calculator, comparison, leaderboard, whales, giants, NFTs, price intel, and widgets more reliably' },
            { type: '🔧', text: 'Smoke tests now cover the Explore launcher, copy-link controls, Clean theme contrast, widget gallery, and the gentler tour prompt' },
        ]
    },
    {
        date: '2026-05-01',
        entries: [
            { type: '✨', text: 'Footer version sanity check — faint build marker now shows served build metadata plus latest GitHub main commit' },
            { type: '⚡', text: 'Service worker cache bumped and shell assets switched network-first so front-page JS and version metadata stay fresh' },
            { type: '🔧', text: 'Git version stamping made reproducible with tracked .githooks pre-commit setup and install-hooks script' },
            { type: '🔧', text: 'Price Intel toggle now opens immediately and gracefully handles slow live price data' },
            { type: '🎨', text: 'Theme variable aliases restored for dynamically injected feature panels and hover states' },
            { type: '⚡', text: 'Front-page CSS and app module paths now carry explicit cache-busting stamps' },
            { type: '🔧', text: 'Standalone baker-card and combo widgets no longer throw on load' },
            { type: '🔧', text: 'Fixed deep links for newer themes and comparison/calculator navigation' },
            { type: '🎨', text: 'Feature dropdown rows now keep long labels aligned without wrapping' },
            { type: '🎨', text: 'Data export choices and CSV labels now use clearer formatting' },
            { type: '🎨', text: 'Mobile QA pass tightened price-bar and widget builder layouts' },
            { type: '🎨', text: 'Mobile Stake and Bake shortcuts now stay grouped together in the price bar' },
            { type: '🔧', text: 'Keyboard shortcuts overlay now closes on outside click as well as keyboard input' },
            { type: '🔧', text: 'Added AGENTS.md repo map and maintenance rules for future agents' },
            { type: '🔧', text: 'Added repeatable QA checks for static assets, browser smoke flows, pages, and widgets' },
        ]
    },
    {
        date: '2026-03-09',
        entries: [
            { type: '✨', text: 'Smart header button — shows truncated address + pending rewards when connected' },
            { type: '✨', text: 'Blurred preview empty state — redacted stats teaser with "Connect to unlock" overlay' },
            { type: '✨', text: 'Keyboard shortcut — press M to toggle the My Tezos drawer' },
            { type: '✨', text: 'Copy-to-clipboard on address — Save button becomes Copy after connecting' },
            { type: '✨', text: 'Share My Stats button in drawer — one-click PNG + tweet export' },
            { type: '✨', text: 'Baker health grade in drawer — letter grade (A+ to F) from report card scoring' },
            { type: '✨', text: 'Historical rewards sparkline — per-cycle earnings trend chart in drawer' },
            { type: '✨', text: 'Non-baker conditional — CTA to delegate instead of empty baker fields' },
            { type: '✨', text: 'Multi-address support — save up to 10 addresses, switch between them instantly' },
            { type: '✨', text: 'Refresh/freshness indicator — last updated timestamp + manual refresh button in drawer' },
            { type: '✨', text: 'My Tezos drawer redesign — right-side slideout replaces the old inline My Baker section' },
            { type: '✨', text: 'Connected flow rebuilt inside drawer: rewards tracker → baker stats → tabbed Morning Brief → Network Context' },
            { type: '✨', text: 'New My Tezos mini-bar under the price bar — one-click reopen with address, balance, and baker status' },
            { type: '🔧', text: 'Removed standalone Daily Briefing card and Features toggles for My Tezos/Briefing; personalization now centralized in drawer UI' },
            { type: '✨', text: 'Governance Live Vote bar — full-width event indicator during active votes, click to open The Chamber directly' },
            { type: '✨', text: 'Phase-specific intensity: pulsing dot, green glow during exploration/promotion, amber during adoption' },
            { type: '🔧', text: 'Fixed 4 theme title colors (NERV, Abyss, Moss, Warzone) — were showing default gradient instead of theme accent' },
            { type: '🔧', text: 'Fixed Chamber modal scroll — content was cut off by overflow:hidden, now scrollable' },
            { type: '🔧', text: 'Fixed My Tezos "While you were away" showing full balance as delta on first visit' },
            { type: '🔒', text: 'XSS hardening — all TzKT API data (proposal names, baker aliases) now escaped before innerHTML injection' },
            { type: '🔒', text: 'Sparkline data guard — collector now aborts snapshot if critical fields are zero (prevents bad data points)' },
            { type: '🔧', text: 'Fixed sparkline tooltips showing 1969 dates — was reading chart index instead of actual timestamp' },
        ]
    },
    {
        date: '2026-03-08',
        entries: [
            { type: '✨', text: '3 new animated themes: Abyss (deep ocean bioluminescence), Moss (organic mycelium network), Warzone (military HUD radar)' },
            { type: '🎨', text: 'Theme picker redesign — grouped into ✦ Animated and ◆ Classic with tagline hints on hover' },
            { type: '🎨', text: 'Landing page updated to 12 themes with all new entries in the theme grid' },
            { type: '🎨', text: 'All themes upgraded to monochrome commitment — every theme now has total color identity' },
            { type: '🎨', text: 'Default renamed to Midnight — refined blue monochrome premium feel' },
            { type: '🎨', text: 'Void → purple monochrome, Signal → warm teal-green, NERV → orange monochrome' },
            { type: '🎨', text: 'Clean theme refined with Apple Finance aesthetic, better card shadows' },
            { type: '🎨', text: 'Component overrides added for all 12 themes — uptime clock, cards, modals, buttons' },
        ]
    },
    {
        date: '2026-03-02',
        entries: [
            { type: '✨', text: 'Governance moments — toast notifications for new proposals, period changes, and protocol activations' },
            { type: '✨', text: 'Baker vote status in My Tezos — shows whether your baker voted during active governance periods' },
            { type: '🔧', text: 'Dynamic upgrade count — all hardcoded "21 upgrades" now pulled live from TzKT protocols API' },
            { type: '🔧', text: 'UPGRADE_HIGHLIGHTS graceful fallback — unknown future protocols get auto-generated highlights instead of generic text' },
            { type: '🔧', text: 'Protocol timeline (PROTOCOL_ERAS) now auto-extends from TzKT for future upgrades' },
            { type: '🔧', text: 'Comparison page narrative and tweet templates use dynamic upgrade count' },
            { type: '🔧', text: 'Protocol data cached with 5-minute TTL to reduce redundant API calls' },
            { type: '✨', text: 'Vote tally breakdown during exploration/promotion — yay/nay/pass bars + supermajority progress' },
            { type: '✨', text: 'Proposal period upvote tracking — flags if baker has not upvoted any proposals' },
            { type: '✨', text: 'Time-weighted vote urgency — gentle reminder early, red alert when period ending' },
            { type: '✨', text: 'Quorum + supermajority context in My Tezos baker card during active votes' },
            { type: '✨', text: 'Proposal name shown in governance period change toasts' },
        ]
    },
    {
        date: '2026-02-28',
        entries: [
            { type: '🔧', text: 'Corrected ETH staking concentration copy: ~5–7 entities for 50% (Lido ~23%), not ~2' },
            { type: '🔧', text: 'Fixed Chain Comparison live Tezos values when Stats section is collapsed — staking and issuance now populate on initial load' },
            { type: '🔧', text: 'Comparison cards now treat 0 as a valid numeric value instead of rendering em dash' },
            { type: '🔧', text: 'Fixed clipboard copy on desktop — images now copy reliably (Promise-based ClipboardItem preserves user gesture)' },
        ]
    },
    {
        date: '2026-02-27',
        entries: [
            { type: '✨', text: 'Nav redesign — clean header: 👤 My Tezos | 🧩 Features | ⚙️ | Stake ↗ | Bake ↗' },
            { type: '✨', text: 'Living Uptime Clock — real-time ticking counter (2,720d+), block pulse with heartbeat animation, network status dot' },
            { type: '✨', text: 'Block updates via TzC RPC (eu.rpc.tez.capital) — real-time every 6s, dot turns red if stale >18s' },
            { type: '✨', text: 'Baker Report Card — shareable monthly performance summary with letter grades (A+ to F), rank, stats, PNG export' },
            { type: '🔧', text: 'Killed "Compare" button confusion — chain comparison is now a toggleable section ("Chains" in Features), defaults visible' },
            { type: '🔧', text: 'Features & Settings split into separate dropdowns (features toggle content, settings configure)' },
            { type: '🔧', text: 'My Baker section renamed to My Tezos — unified personalization branding' },
            { type: '🔧', text: 'Removed redundant badges (Stake-o-meter gauge, Zero Forks, Days Live) — data now in uptime clock' },
            { type: '🔧', text: 'Removed price bar network pulse indicator — uptime clock dot is the sole liveness indicator' },
            { type: '🔧', text: 'Fixed Last Cycle rewards showing "—" — updated to Tallinn-era TzKT field names' },
            { type: '🔧', text: 'Fixed Leaderboard toggle always appearing active when off' },
            { type: '🔧', text: 'Fixed header button spacing and Compare emoji rendering' },
            { type: '🎨', text: 'Uptime clock glass-morphism box with theme-aware colors (all 7 themes)' },
            { type: '🎨', text: 'Fixed-width counter digits — no more layout shift on tick' },
            { type: '🎨', text: 'My Tezos connected state: subtle inner glow instead of underline' },
            { type: '🎨', text: 'Tighter upgrade section proportions — reduced height, better column balance' },
        ]
    },
    {
        date: '2026-02-26',
        entries: [
            { type: '⚡', text: 'Chart.js now loads with defer — no longer blocks initial render' },
            { type: '⚡', text: 'Critical JS modules preloaded in parallel (modulepreload) — faster startup' },
            { type: '⚡', text: 'Sparkline refresh skipped when tab is backgrounded — fewer wasted API calls' },
            { type: '🔧', text: 'Protocol timeline tooltips now match theme after switching (no longer stale)' },
            { type: '✨', text: 'Offline mode — Service Worker caches the dashboard for instant loads and offline viewing' },
            { type: '✨', text: 'URL deep-linking — share links like #my-baker=tz1..., #compare, #theme=void, #history' },
            { type: '✨', text: 'Keyboard shortcuts — press ? for the full list (r=refresh, t=theme, m=baker, h=history…)' },
            { type: '⚡', text: 'Baker fetch optimized — uses /count + select=address (saves ~2-5MB per load)' },
            { type: '⚡', text: 'CSS minified — 230KB → 159KB (31% smaller)' },
            { type: '⚡', text: 'Theme fonts lazy-loaded — only Orbitron blocks initial render now' },
            { type: '⚡', text: 'Images optimized to WebP — OG image 277KB → 57KB, icons 117KB → 19KB' },
            { type: '🔒', text: 'Fixed GraphQL injection in .tez domain resolver — now uses parameterized variables' },
            { type: '🔒', text: 'Protocol history modal now escapes all interpolated data (XSS prevention)' },
            { type: '🔧', text: 'Whale tracker and Sleeping Giants polling now pauses when tab is backgrounded' },
            { type: '🔧', text: 'Fixed duplicate sparkline rendering on initial page load' },
            { type: '🔧', text: 'Fixed mainnet launch date: Sep 17, 2018 (was incorrectly using Jun 30 fundraiser date)' },
            { type: '✨', text: 'Mobile Overview tab now shows headline metrics (Bakers, APY, Staked, Transactions)' },
            { type: '✨', text: 'Offline indicator banner when network is unavailable' },
            { type: '🎨', text: 'Loading shimmer animation on stat cards instead of static "..."' },
            { type: '✨', text: 'Keyboard shortcuts accessible from ⚙️ Settings → ⌨️ Shortcuts (discoverable on mobile too)' },
            { type: '✨', text: 'Protocol timeline now shows year labels under key upgrade letters for at-a-glance context' },
            { type: '🔧', text: 'Clarified ETH comparison: "2 entities control 50% of stake" (was misleading)' },
            { type: '⚡', text: 'Removed cache-buster on tweets.json fetch — now properly cached by Service Worker' },
            { type: '🔧', text: 'Aligned dead price refresh config to 30min (matching actual cache TTL)' },
            { type: '🔧', text: 'Meta description no longer hardcodes stale baker counts — now generic' },
            { type: '🔧', text: 'Cycle time now fetched from RPC constants instead of hardcoded 6s' },
            { type: '⚡', text: 'Deduplicated TzKT statistics endpoint — 4 concurrent calls reduced to 1' },
            { type: '⚡', text: 'TzKT 429 rate-limit detection with exponential backoff' },
            { type: '✨', text: '"Zero Forks" badge now shows the exact fork-free day count' },
            { type: '✨', text: 'Governance countdown banner — shows active voting periods prominently' },
            { type: '✨', text: 'Network health pulse — green/yellow/red dot showing if blocks are on schedule' },
            { type: '✨', text: 'Data export — download all stats as JSON or CSV from ⚙️ → 📥 Export' },
            { type: '✨', text: 'Branded 404 page — "This block was never baked"' },
            { type: '🎨', text: 'Mobile tab labels shortened on small screens (Gov, Eco) to prevent clipping' },
        ]
    },
    {
        date: '2026-02-16',
        entries: [
            { type: '✨', text: 'Changelog — view full site history from ⚙️ settings' },
            { type: '✨', text: 'Per-card historical charts — click 📊 on any card with a sparkline' },
            { type: '🔧', text: 'My Baker: Fixed missed stats — now shows actual missed blocks/attestations for cycle and lifetime' },
            { type: '🔧', text: 'My Baker: Deferred missed rights API calls to avoid TzKT rate limiting (429s)' },
            { type: '✨', text: 'Added LB (Liquid Baking) to issuance card' },
        ]
    },
    {
        date: '2026-02-15',
        entries: [
            { type: '🔧', text: 'Fixed mobile view layout issues' },
        ]
    },
    {
        date: '2026-02-12',
        entries: [
            { type: '✨', text: 'Network Moments — dismissable highlights at the top' },
            { type: '✨', text: 'Hero section redesign' },
            { type: '✨', text: 'Search engine and agent discovery optimization' },
            { type: '✨', text: 'Hotstream & "since last visit" theme elements' },
            { type: '🎨', text: 'Bubblegum theme added' },
            { type: '🎨', text: 'Title rework and formatting improvements' },
            { type: '🎨', text: 'Better theme picker and README update' },
            { type: '✨', text: 'Feedback/contribute link added' },
            { type: '🎨', text: 'Card footers and simple design cleanup' },
            { type: '✨', text: 'New OG image for social sharing' },
            { type: '🔧', text: 'Fix historical data sharing' },
            { type: '🔧', text: 'Fix sparklines color across themes' },
            { type: '✨', text: 'New favicon' },
        ]
    },
    {
        date: '2026-02-11',
        entries: [
            { type: '✨', text: 'Price ticker moved to top' },
            { type: '✨', text: 'Staker/delegator capacity bars on My Baker' },
            { type: '✨', text: 'Pulse indicators on Giants & Whales' },
            { type: '✨', text: 'Attestation rate and DAL participation via Octez RPC' },
            { type: '✨', text: 'Bake & Stake action buttons in nav' },
            { type: '🎨', text: 'More themes: Dark, Clean, Void, Ember, Signal' },
            { type: '✨', text: 'My Baker: .tez domain resolution' },
            { type: '✨', text: 'My Baker expanded with baker estimated payments' },
            { type: '✨', text: 'Rewards calculator split out as separate feature' },
            { type: '✨', text: 'OG image for social media previews' },
            { type: '🔧', text: 'Mobile screenshot and gap fixes' },
            { type: '🎨', text: 'Mobile-specific info buttons and AI explanation on Stake-o-meter' },
        ]
    },
    {
        date: '2026-02-10',
        entries: [
            { type: '✨', text: 'My Baker lookup, Rewards Calculator, and How Tezos Compares section' },
            { type: '✨', text: 'Stake-o-meter gauge, price display, and hot streak counter' },
            { type: '✨', text: 'Social sharing with contentious protocol tweet cards' },
            { type: '✨', text: 'Sparkline bragging rights' },
            { type: '🔒', text: 'Security audit: escapeHtml, parameterized GraphQL, CSP tuning' },
            { type: '🔧', text: 'Fix APY calculation' },
            { type: '🔧', text: 'Fix favicon and mini whales display' },
            { type: '⚡', text: 'API rate limiting improvements' },
        ]
    },
    {
        date: '2026-02-09',
        entries: [
            { type: '✨', text: 'Historical data charts with full modal view' },
            { type: '✨', text: 'Sparklines on all stat cards with trend arrows' },
            { type: '✨', text: 'Protocol upgrade history timeline' },
            { type: '✨', text: 'Ultra mode with sound effects' },
            { type: '✨', text: 'Sleeping Giants tracker' },
            { type: '✨', text: '"Start Baking" banner' },
            { type: '🎨', text: 'Matrix theme set as default' },
            { type: '⚡', text: 'Data caching and "since last visit" tracking' },
            { type: '🔧', text: 'Mobile view and whale watch fixes' },
            { type: '✨', text: '7-day % change on trendlines' },
        ]
    },
    {
        date: '2026-02-08',
        entries: [
            { type: '✨', text: 'Historical data collection system' },
            { type: '🔧', text: 'Fix tz4 counting — use consensus keys, not addresses' },
            { type: '🔧', text: 'Switch to TzKT API with multiple RPC fallbacks' },
            { type: '🔧', text: 'Use tez.capital RPCs for reliability' },
        ]
    },
    {
        date: '2026-02-07',
        entries: [
            { type: '🎨', text: 'Matrix visual theme introduced' },
        ]
    },
    {
        date: '2026-01-31',
        entries: [
            { type: '✨', text: 'Updated for 6-second blocks (Tallinn protocol)' },
            { type: '✨', text: 'Arcade effects added' },
        ]
    },
    {
        date: '2026-01-14',
        entries: [
            { type: '✨', text: 'Major expansion: 5 sections, 18 stats' },
            { type: '✨', text: 'Hover tooltips for all metrics' },
            { type: '✨', text: 'Light mode toggle' },
            { type: '🎨', text: 'Premium glassmorphism redesign' },
            { type: '🔧', text: 'Fix issuance calculation and tz4 adoption targets' },
            { type: '⚡', text: '15-minute auto-refresh' },
        ]
    },
    {
        date: '2026-01-13',
        entries: [
            { type: '✨', text: 'Initial launch — Tezos Statistics Dashboard' },
        ]
    },
];

/**
 * Format date for display (e.g., "February 16, 2026")
 */
function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

/**
 * Render changelog entries into the modal
 */
function renderChangelog() {
    const body = document.getElementById('changelog-body');
    if (!body) return;

    let html = '';
    
    for (const section of CHANGELOG) {
        html += `
            <div class="changelog-section">
                <div class="changelog-date">${formatDate(section.date)}</div>
                <ul class="changelog-entries">
        `;
        
        for (const entry of section.entries) {
            html += `
                    <li class="changelog-entry">
                        <span class="changelog-type">${entry.type}</span>
                        <span class="changelog-text">${entry.text}</span>
                    </li>
            `;
        }
        
        html += `
                </ul>
            </div>
        `;
    }
    
    body.innerHTML = html;
}

/**
 * Open the changelog modal
 */
function openChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

/**
 * Close the changelog modal
 */
function closeChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

/**
 * Initialize changelog modal and button
 */
export function initChangelog() {
    // Render the changelog content
    renderChangelog();
    
    // Get DOM elements
    const button = document.getElementById('changelog-btn');
    const modal = document.getElementById('changelog-modal');
    const closeBtn = modal?.querySelector('.changelog-modal-close');
    const backdrop = modal?.querySelector('.changelog-modal-backdrop');
    
    // Open modal when button is clicked
    if (button) {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            openChangelog();
        });
    }
    
    // Close modal with close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeChangelog);
    }
    
    // Close modal with backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', closeChangelog);
    }
    
    // Close modal with ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.getAttribute('aria-hidden') === 'false') {
            closeChangelog();
        }
    });
}
