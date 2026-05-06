#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZKT = 'https://api.tzkt.io/v1';
const AGORA_SEARCH = 'https://forum.tezosagora.org/search.json';
const GOVERNANCE_VOTES_FILE = path.join(ROOT, 'data', 'governance-votes.json');
const GOVERNANCE_REPORT_FILE = path.join(ROOT, 'data', 'governance-refresh-report.json');
const PROTOCOL_FILE = path.join(ROOT, 'data', 'protocol-data.json');

const GENERATED_FILES = [
    'data/governance-votes.json',
    'data/governance-refresh-report.json'
];

const GOVERNANCE_SURFACES = [
    {
        surface: 'Generated vote history',
        files: ['data/governance-votes.json'],
        update: 'Generated from TzKT epochs on every governance refresh. Exploration and Promotion failures must appear here.'
    },
    {
        surface: 'Governance refresh report',
        files: ['data/governance-refresh-report.json'],
        update: 'Generated audit of live period, current protocol, active proposal, lore coverage, blockers, and warnings.'
    },
    {
        surface: 'Front-page protocol lore',
        files: ['data/protocol-data.json'],
        update: 'Human-edited source of protocol headlines, change bullets, contention flags, and balanced long-form history.'
    },
    {
        surface: 'Front-page upgrade clock',
        files: ['js/features/governance.js', 'js/core/app.js', 'js/core/api.js'],
        update: 'Must resolve live TzKT proposal epochs, use protocol-data for lore, and avoid stale hardcoded protocol maps.'
    },
    {
        surface: 'The Chamber',
        files: ['js/features/chamber.js'],
        update: 'Uses local vote history plus protocol-data names for failed and active governance context.'
    },
    {
        surface: 'Static governance/SEO pages',
        files: ['governance/index.html', 'index.html', 'robots.txt', 'README.md'],
        update: 'Check protocol counts, current protocol names, amendment history claims, and governance period wording when a protocol activates.'
    },
    {
        surface: 'Widgets',
        files: ['widgets/governance.html', 'widgets/protocol.html', 'widgets/combo.html'],
        update: 'Confirm widget labels still match live TzKT period/protocol behavior after voting periods advance.'
    },
    {
        surface: 'Cache and build metadata',
        files: ['sw.js', 'index.html', 'version.json'],
        update: 'Bump service worker/cache stamps after JS/CSS/data dependency changes; version.json is stamped by the pre-commit hook.'
    },
    {
        surface: 'Human changelog',
        files: ['js/features/changelog.js'],
        update: 'Add concise user-facing entries for governance data controls, lore, and front-page behavior changes.'
    }
];

function rel(file) {
    return path.relative(ROOT, file).replaceAll(path.sep, '/');
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, data) {
    await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
    return response.json();
}

function protocolHashMatches(hash, prefix) {
    if (!hash || !prefix) return false;
    return hash.startsWith(prefix) || hash.startsWith(prefix.slice(0, 8)) || prefix.startsWith(hash.slice(0, 8));
}

function proposalAliases(proposal) {
    return [
        proposal?.alias,
        proposal?.extras?.alias,
        proposal?.metadata?.alias
    ].filter(Boolean);
}

function proposalName(proposal) {
    return proposalAliases(proposal)[0]
        || (proposal?.hash ? `${proposal.hash.slice(0, 8)}...` : null);
}

function agoraTopicName(topic) {
    if (!topic?.title) return null;
    return topic.title.replace(/\s*\([^)]*\)\s*$/, '').trim() || null;
}

function proposalDisplayName(proposal, agoraTopic = null) {
    return proposalAliases(proposal)[0]
        || agoraTopicName(agoraTopic)
        || (proposal?.hash ? `${proposal.hash.slice(0, 8)}...` : null);
}

function periodProposal(period, proposals) {
    const scoped = proposals.filter((proposal) => {
        const first = proposal.firstPeriod ?? Number.NEGATIVE_INFINITY;
        const last = proposal.lastPeriod ?? Number.POSITIVE_INFINITY;
        return first <= period.index && period.index <= last;
    });

    return scoped.find((proposal) => proposal.status === 'active')
        || scoped.find((proposal) => ['accepted', 'rejected'].includes(proposal.status))
        || scoped[0]
        || proposals.find((proposal) => proposal.status === 'accepted')
        || proposals[0]
        || null;
}

function protocolFromProposal(proposal, protocols) {
    if (!proposal?.hash) return null;
    return protocols.find((protocol) => protocolHashMatches(proposal.hash, protocol.hash)) || null;
}

function pct(part, total) {
    if (!total) return null;
    return Number(((part / total) * 100).toFixed(2));
}

function supermajorityPct(period) {
    const yay = period.yayVotingPower || 0;
    const nay = period.nayVotingPower || 0;
    const total = yay + nay;
    return total ? Number(((yay / total) * 100).toFixed(2)) : null;
}

function displayName(proposal, protocol) {
    return protocol?.name
        || proposalName(proposal)
        || 'No proposal';
}

function sortedProtocolData(protocolData) {
    return Array.isArray(protocolData?.protocols) ? protocolData.protocols : [];
}

function namedTzktProtocols(tzktProtocols) {
    return tzktProtocols
        .filter((protocol) => protocol.code >= 4 && protocol.extras?.alias)
        .map((protocol) => ({
            code: protocol.code,
            name: protocol.extras.alias,
            hash: protocol.hash,
            firstLevel: protocol.firstLevel ?? null,
            lastLevel: protocol.lastLevel ?? null,
            startTime: protocol.startTime ?? null,
            blockTime: protocol.constants?.timeBetweenBlocks ?? null,
            docs: protocol.extras?.docs ?? null,
            isCurrent: !protocol.lastLevel
        }));
}

function findLoreForProtocol(protocol, protocolData) {
    const lore = sortedProtocolData(protocolData);
    return lore.find((entry) => entry.name === protocol.name)
        || lore.find((entry) => protocolHashMatches(protocol.hash, entry.hash))
        || null;
}

function findLoreForProposal(proposal, protocolData) {
    if (!proposal?.hash) return null;
    const lore = sortedProtocolData(protocolData);
    return lore.find((entry) => protocolHashMatches(proposal.hash, entry.hash))
        || proposalAliases(proposal).map((alias) => lore.find((entry) => entry.name === alias)).find(Boolean)
        || null;
}

async function lookupAgoraTopic(proposalHash) {
    if (!proposalHash) return null;
    const url = `${AGORA_SEARCH}?q=${encodeURIComponent(proposalHash)}`;
    try {
        const data = await fetchJson(url);
        const shortHash = proposalHash.slice(0, 8);
        const topic = (data.topics || []).find((candidate) => {
            const title = candidate.title || '';
            return title.includes(shortHash) || title.includes(proposalHash);
        }) || data.topics?.[0] || null;
        if (!topic) return null;
        return {
            title: topic.title,
            name: agoraTopicName(topic),
            url: topic.slug && topic.id
                ? `https://forum.tezosagora.org/t/${topic.slug}/${topic.id}`
                : null,
            createdAt: topic.created_at || null
        };
    } catch (error) {
        return {
            lookupError: error.message,
            url
        };
    }
}

function buildPeriodVotes(epochs, protocolDataProtocols) {
    const periodVotes = [];

    for (const epoch of epochs) {
        const proposals = epoch.proposals || [];
        for (const period of epoch.periods || []) {
            if (!['exploration', 'promotion'].includes(period.kind)) continue;

            const proposal = periodProposal(period, proposals);
            const protocol = protocolFromProposal(proposal, protocolDataProtocols);
            const participated = (period.yayVotingPower || 0) + (period.nayVotingPower || 0) + (period.passVotingPower || 0);

            periodVotes.push({
                epoch: epoch.index,
                epochStatus: epoch.status,
                period: period.index,
                kind: period.kind,
                status: period.status,
                startTime: period.startTime,
                endTime: period.endTime,
                totalBakers: period.totalBakers ?? null,
                totalVotingPower: period.totalVotingPower ?? null,
                ballotsQuorum: period.ballotsQuorum ?? null,
                supermajority: period.supermajority ?? null,
                yayBallots: period.yayBallots ?? null,
                yayVotingPower: period.yayVotingPower ?? null,
                nayBallots: period.nayBallots ?? null,
                nayVotingPower: period.nayVotingPower ?? null,
                passBallots: period.passBallots ?? null,
                passVotingPower: period.passVotingPower ?? null,
                participationPct: pct(participated, period.totalVotingPower),
                yayPct: supermajorityPct(period),
                proposalHash: proposal?.hash || null,
                proposalStatus: proposal?.status || null,
                proposalAlias: proposalName(proposal),
                protocolName: protocol?.name || null,
                protocolNumber: protocol?.number || null,
                displayName: displayName(proposal, protocol)
            });
        }
    }

    return periodVotes;
}

function summarizeCurrentGovernance(currentPeriod, epochs, protocolData, activeProposalAgoraTopic) {
    const currentEpoch = epochs.find((epoch) => epoch.index === currentPeriod.epoch) || null;
    const proposals = currentEpoch?.proposals || [];
    const proposal = periodProposal(currentPeriod, proposals);
    const proposalLore = findLoreForProposal(proposal, protocolData);
    const participated = (currentPeriod.yayVotingPower || 0) + (currentPeriod.nayVotingPower || 0) + (currentPeriod.passVotingPower || 0);
    const proposalAccepted = currentPeriod.kind === 'adoption'
        || proposal?.status === 'accepted'
        || currentEpoch?.status === 'completed';

    return {
        epoch: currentPeriod.epoch ?? null,
        epochStatus: currentEpoch?.status ?? null,
        period: currentPeriod.index ?? null,
        kind: currentPeriod.kind ?? null,
        status: currentPeriod.status ?? null,
        startTime: currentPeriod.startTime ?? null,
        endTime: currentPeriod.endTime ?? null,
        proposalHash: proposal?.hash ?? null,
        proposalName: proposalDisplayName(proposal, activeProposalAgoraTopic),
        proposalStatus: proposal?.status ?? null,
        proposalAccepted,
        proposalHasLore: Boolean(proposalLore),
        proposalAgoraTopic: activeProposalAgoraTopic,
        initiator: proposal?.initiator ? {
            alias: proposal.initiator.alias ?? null,
            address: proposal.initiator.address ?? null
        } : null,
        upvotes: proposal?.upvotes ?? null,
        votingPower: proposal?.votingPower ?? null,
        tally: {
            yayVotingPower: currentPeriod.yayVotingPower ?? null,
            nayVotingPower: currentPeriod.nayVotingPower ?? null,
            passVotingPower: currentPeriod.passVotingPower ?? null,
            yayPct: supermajorityPct(currentPeriod),
            participationPct: pct(participated, currentPeriod.totalVotingPower),
            ballotsQuorum: currentPeriod.ballotsQuorum ?? null,
            supermajority: currentPeriod.supermajority ?? null
        }
    };
}

function buildReport({ generatedAt, protocolData, tzktProtocols, epochs, currentPeriod, periodVotes, activeProposalAgoraTopic }) {
    const namedProtocols = namedTzktProtocols(tzktProtocols);
    const currentProtocol = namedProtocols.find((protocol) => protocol.isCurrent) || namedProtocols[namedProtocols.length - 1] || null;
    const currentGovernance = summarizeCurrentGovernance(currentPeriod, epochs, protocolData, activeProposalAgoraTopic);
    const missingAcceptedProtocolLore = namedProtocols.filter((protocol) => !findLoreForProtocol(protocol, protocolData));
    const failedVotes = periodVotes.filter((vote) => ['no_quorum', 'no_supermajority'].includes(vote.status));
    const blockers = [];
    const warnings = [];

    if (missingAcceptedProtocolLore.length) {
        blockers.push({
            code: 'missing-accepted-protocol-lore',
            message: 'TzKT lists activated/current named protocols that are missing from data/protocol-data.json.',
            protocols: missingAcceptedProtocolLore
        });
    }

    if (currentGovernance.proposalAccepted && currentGovernance.proposalHash && !currentGovernance.proposalHasLore) {
        blockers.push({
            code: 'accepted-proposal-missing-lore',
            message: 'A proposal appears accepted or in Adoption, but protocol-data.json does not contain its lore yet.',
            proposal: {
                name: currentGovernance.proposalName,
                hash: currentGovernance.proposalHash,
                status: currentGovernance.proposalStatus,
                periodKind: currentGovernance.kind
            }
        });
    } else if (currentGovernance.proposalHash && !currentGovernance.proposalHasLore) {
        warnings.push({
            code: 'active-proposal-needs-research-watch',
            message: 'Active proposal is not in protocol-data.json yet. Track TezosAgora, X, and official docs now; add balanced lore if it reaches Adoption/current protocol.',
            proposal: {
                name: currentGovernance.proposalName,
                hash: currentGovernance.proposalHash,
                status: currentGovernance.proposalStatus,
                periodKind: currentGovernance.kind
            }
        });
    }

    if (periodVotes.length !== periodVotes.filter((vote) => ['exploration', 'promotion'].includes(vote.kind)).length) {
        blockers.push({
            code: 'unexpected-period-vote-kind',
            message: 'Generated governance vote history contains a non Exploration/Promotion row.'
        });
    }

    return {
        generatedAt,
        status: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ok',
        source: {
            tzktEpochs: `${TZKT}/voting/epochs?limit=1000&sort.asc=index`,
            tzktCurrentPeriod: `${TZKT}/voting/periods/current`,
            tzktProtocols: `${TZKT}/protocols?sort.asc=code`,
            tezosAgoraSearch: AGORA_SEARCH
        },
        singleEntryPoint: 'scripts/refresh-governance-data.mjs',
        generatedFiles: GENERATED_FILES,
        currentProtocol,
        currentGovernance,
        coverage: {
            activatedProtocolLore: {
                ok: missingAcceptedProtocolLore.length === 0,
                missing: missingAcceptedProtocolLore
            },
            activeProposalLore: {
                ok: currentGovernance.proposalHasLore || !currentGovernance.proposalHash,
                missing: currentGovernance.proposalHash && !currentGovernance.proposalHasLore ? [{
                    name: currentGovernance.proposalName,
                    hash: currentGovernance.proposalHash,
                    status: currentGovernance.proposalStatus,
                    periodKind: currentGovernance.kind
                }] : []
            },
            voteHistory: {
                epochCount: epochs.length,
                periodVoteCount: periodVotes.length,
                failedVoteCount: failedVotes.length,
                failedVotes: failedVotes.map((vote) => ({
                    epoch: vote.epoch,
                    period: vote.period,
                    kind: vote.kind,
                    status: vote.status,
                    displayName: vote.displayName,
                    proposalHash: vote.proposalHash,
                    yayPct: vote.yayPct,
                    participationPct: vote.participationPct
                }))
            }
        },
        updatePolicy: {
            preCommit: 'The tracked .githooks/pre-commit hook runs this script before scripts/stamp-version.sh.',
            acceptedProtocolGate: 'Commits should fail when TzKT has an accepted/current named protocol that is missing from data/protocol-data.json.',
            failedWindowRefresh: 'Exploration and Promotion failures are pulled from TzKT epochs and included in governance-votes.json.',
            researchStandard: 'For new accepted protocol lore, use official changelogs/docs plus TezosAgora debate threads and X/community discussion; present steelmanned pro and con arguments.'
        },
        researchChecklist: [
            'TzKT protocol and governance endpoints for objective state, dates, hashes, and period outcomes.',
            'Tezos Agora proposal thread and related heads-up/research threads for proponents, tradeoffs, and unresolved questions.',
            'Official Octez changelog and protocol documentation for technical facts and breaking changes.',
            'X/community search for baker and ecosystem reactions, especially concerns not captured in the proposal post.',
            'Update data/protocol-data.json headline, changes, debate/contention, and history before the accepted protocol becomes the front-page current protocol.'
        ],
        staleDataSurfaces: GOVERNANCE_SURFACES,
        warnings,
        blockers
    };
}

async function stageGeneratedFiles() {
    await execFileAsync('git', ['add', ...GENERATED_FILES], { cwd: ROOT });
}

export async function main(argv = process.argv.slice(2)) {
    const stage = argv.includes('--stage');
    const generatedAt = new Date().toISOString();
    const protocolData = await readJson(PROTOCOL_FILE);
    const protocolDataProtocols = sortedProtocolData(protocolData);

    const [epochs, currentPeriod, tzktProtocols] = await Promise.all([
        fetchJson(`${TZKT}/voting/epochs?limit=1000&sort.asc=index`),
        fetchJson(`${TZKT}/voting/periods/current`),
        fetchJson(`${TZKT}/protocols?sort.asc=code`)
    ]);
    const currentEpoch = epochs.find((epoch) => epoch.index === currentPeriod.epoch) || null;
    const currentProposal = periodProposal(currentPeriod, currentEpoch?.proposals || []);
    const activeProposalAgoraTopic = await lookupAgoraTopic(currentProposal?.hash);

    const periodVotes = buildPeriodVotes(epochs, protocolDataProtocols);
    const failedVoteCount = periodVotes.filter((vote) => ['no_quorum', 'no_supermajority'].includes(vote.status)).length;

    const votesPayload = {
        generatedAt,
        source: `${TZKT}/voting/epochs?limit=1000&sort.asc=index`,
        epochCount: epochs.length,
        periodVoteCount: periodVotes.length,
        failedVoteCount,
        epochs,
        periodVotes
    };

    const report = buildReport({
        generatedAt,
        protocolData,
        tzktProtocols,
        epochs,
        currentPeriod,
        periodVotes,
        activeProposalAgoraTopic
    });

    await writeJson(GOVERNANCE_VOTES_FILE, votesPayload);
    await writeJson(GOVERNANCE_REPORT_FILE, report);

    if (stage) await stageGeneratedFiles();

    const period = report.currentGovernance;
    const proposal = period.proposalName || period.proposalHash || 'no proposal';
    console.log(`Wrote ${rel(GOVERNANCE_VOTES_FILE)} with ${epochs.length} epochs, ${periodVotes.length} exploration/promotion votes, ${failedVoteCount} failures`);
    console.log(`Wrote ${rel(GOVERNANCE_REPORT_FILE)}: ${report.status}; current ${report.currentProtocol?.name || 'unknown'}; ${period.kind || 'unknown'} ${period.status || 'unknown'} (${proposal})`);

    for (const warning of report.warnings) {
        console.warn(`warn - ${warning.code}: ${warning.message}`);
    }

    if (report.blockers.length) {
        for (const blocker of report.blockers) {
            console.error(`fail - ${blocker.code}: ${blocker.message}`);
        }
        process.exitCode = 1;
    }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
