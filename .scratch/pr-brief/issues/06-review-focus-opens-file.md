# 06: Review focus opens the file in Files changed

**What to build:** Clicking a Review focus item opens the Files changed tab on that file. When the item has a verified line, the diff expands the file and scrolls to that line. If the line or file is not present, the tab simply opens.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Click navigates to the Files changed tab with the file (and line) in the URL
- [ ] The file is expanded and the diff scrolls to the line when it exists
- [ ] Unknown file or line does not break the page
- [ ] Component tests: navigation target from the card; diff tab reacts to file/line
