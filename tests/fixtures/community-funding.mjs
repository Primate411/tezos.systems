import { normalizeTeztree, normalizeHacktez } from '../../scripts/lib/community-funding.mjs';

export function fundingFixtures(now = Date.now()) {
    const generatedAt = new Date(now).toISOString();
    const creator = 'tz1UudsSivj7UC4XMFi3T6ngFJ1zPuzBjhVm';
    const campaigns = { campaigns: [
        { id: 1, title: 'Community archive', summary: 'Keep an independent art archive available.', creator, payout: creator,
            goalMutez: '100000000', raisedMutez: '25000000', backers: 2, closed: false, status: 'live', moderation: null,
            deadline: new Date(now + 86400000).toISOString(), createdAt: new Date(now - 86400000).toISOString() },
        { id: 2, title: 'Closed campaign', summary: 'Closed before its future deadline.', creator,
            goalMutez: '100000000', raisedMutez: '12500000', backers: 1, closed: true, funded: true, status: 'live',
            deadline: new Date(now + 86400000).toISOString() },
        { id: 3, title: 'Expired campaign', summary: 'Its deadline has passed.', creator,
            goalMutez: null, raisedMutez: null, backers: null, closed: false, status: 'live', deadline: new Date(now - 86400000).toISOString() }
    ] };
    const projects = { generatedAt, total: 9, network: 'mainnet', data: Array.from({ length: 9 }, (_, index) => ({
        name: `Project ${index + 1}`, slug: `project-${index + 1}`, desc: 'A community project with a readable description and a stable place in the room.',
        status: index ? 'live' : 'wip', urls: { page: `https://hacktez.com/u/builder/p/project-${index + 1}` },
        member: { name: 'builder.hack.tez', label: 'builder', displayName: 'Builder' },
        tips: { enabled: index < 8, amounts: ['1', '5', '10'], customAmount: true }
    })) };
    const members = { generatedAt, total: 1, network: 'mainnet', data: [{ name: 'builder.hack.tez', tipCounters: {
        count: 999, totals: [{ asset: 'tez', symbol: 'tez', total: '99999' }],
        projects: [{ slug: 'project-1', count: 2, totals: [{ asset: 'tez', symbol: 'tez', total: '12.5' }, { asset: 'KT1asset:0', symbol: 'OTHER', total: '700' }] }]
    } }] };
    return { campaigns, projects, members, teztree: normalizeTeztree(campaigns, generatedAt), hacktez: normalizeHacktez(projects, members, generatedAt) };
}
