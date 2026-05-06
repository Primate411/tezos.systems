#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZKT = 'https://api.tzkt.io/v1';
const OUT_FILE = path.join(ROOT, 'data', 'governance-votes.json');
const PROTOCOL_FILE = path.join(ROOT, 'data', 'protocol-data.json');

function protocolHashMatches(hash, prefix) {
    if (!hash || !prefix) return false;
    return hash.startsWith(prefix) || hash.startsWith(prefix.slice(0, 8)) || prefix.startsWith(hash.slice(0, 8));
}

function periodProposal(period, proposals) {
    const scoped = proposals.filter((proposal) => {
        const first = proposal.firstPeriod ?? Number.NEGATIVE_INFINITY;
        const last = proposal.lastPeriod ?? Number.POSITIVE_INFINITY;
        return first <= period.index && period.index <= last;
    });

    return scoped.find((proposal) => ['accepted', 'rejected'].includes(proposal.status))
        || scoped[0]
        || proposals.find((proposal) => proposal.status === 'accepted')
        || proposals[0]
        || null;
}

function proposalProtocol(proposal, protocols) {
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
        || proposal?.extras?.alias
        || (proposal?.hash ? `${proposal.hash.slice(0, 8)}...` : 'No proposal');
}

async function main() {
    const protocols = JSON.parse(await fs.readFile(PROTOCOL_FILE, 'utf8')).protocols || [];
    const response = await fetch(`${TZKT}/voting/epochs?limit=1000&sort.asc=index`);
    if (!response.ok) throw new Error(`TzKT voting epochs HTTP ${response.status}`);

    const epochs = await response.json();
    const periodVotes = [];

    for (const epoch of epochs) {
        const proposals = epoch.proposals || [];
        for (const period of epoch.periods || []) {
            if (!['exploration', 'promotion'].includes(period.kind)) continue;

            const proposal = periodProposal(period, proposals);
            const protocol = proposalProtocol(proposal, protocols);
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
                proposalAlias: proposal?.extras?.alias || null,
                protocolName: protocol?.name || null,
                protocolNumber: protocol?.number || null,
                displayName: displayName(proposal, protocol)
            });
        }
    }

    const failedVoteCount = periodVotes.filter((vote) => ['no_quorum', 'no_supermajority'].includes(vote.status)).length;
    const payload = {
        generatedAt: new Date().toISOString(),
        source: `${TZKT}/voting/epochs?limit=1000&sort.asc=index`,
        epochCount: epochs.length,
        periodVoteCount: periodVotes.length,
        failedVoteCount,
        epochs,
        periodVotes
    };

    await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} with ${epochs.length} epochs, ${periodVotes.length} exploration/promotion votes, ${failedVoteCount} failures`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
