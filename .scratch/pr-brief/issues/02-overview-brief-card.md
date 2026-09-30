# 02: Overview PR Brief card

**What to build:** On a PR's Overview tab the reviewer sees a PR Brief card. With no Brief it shows a Generate brief button; pressing it generates the Brief and then shows the summary, Risk areas (title and file each) and a plain Review focus list (`file:line — reason`, reading order). After a page reload the same Brief appears immediately.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Empty state shows Generate brief
- [ ] After generation the summary, Risk areas and Review focus are visible; each risk has a title and file, each focus item a file, optional line and reason
- [ ] Reloading shows the stored Brief without regenerating
- [ ] Item without a verified line shows the file alone
- [ ] Client component test (mocked fetch): empty → Generate → Brief shown
