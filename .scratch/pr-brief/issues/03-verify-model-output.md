# 03: Verify the model's files and lines

**What to build:** No invented path or line reaches the reviewer. After the model answers, any risk or Review focus item naming a file that is not in the PR is dropped; a risk left with no valid file is dropped; a line outside the changed ranges of its file is cleared and the item keeps only the file. The model is never re-asked. When nothing survives, the card shows the "no notable risks" message.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Invented file paths never appear in Risk areas or Review focus
- [ ] A risk with no valid file is dropped
- [ ] An out-of-range line is cleared, the item stays with its file
- [ ] Still exactly one model call per generation
- [ ] Empty risks render the no-risks message
- [ ] Route tests with a mock model returning bad paths/lines
