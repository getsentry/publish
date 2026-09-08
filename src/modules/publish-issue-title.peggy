{
  function join(characters) {
    return characters.join("");
  }
}

// BEGIN TITLE GRAMMAR
// Canonical grammar for publish issue titles. A path suffix is syntactic only:
// the controller resolves the complete suffix as a workspace after checking
// out the CI-approved revision.
PublishIssueTitle
  = "publish: " "getsentry/"? repo:Repository path:Path? "@" version:Version !. {
      return {
        repo,
        path: path || "",
        version,
      };
    }

Repository
  = characters:RepositoryCharacter+ { return join(characters); }

RepositoryCharacter
  = [A-Za-z0-9_.-]

Path
  = segments:("/" segment:PathSegment { return `/${segment}`; })+ { return join(segments); }

PathSegment
  = characters:RepositoryCharacter+ { return join(characters); }

Version
  = characters:[A-Za-z0-9_.+-]+ { return join(characters); }
// END TITLE GRAMMAR

// The release revision must be read from the request header at the start of
// the issue body. CheckRunsLinkCount protects it from appended decoy links.
ReleaseRevision
  = header:RequestHeader .* { return header; }

RequestHeader
  = "Requested by: @" NonNewline Newline BlankLines
    Indent "Merge target: " mergeTarget:MergeTarget Newline BlankLines
    Indent "Quick links:" Newline BlankLines
    Indent "- [View changes](" LinkDestination ")" Newline
    Indent "- [View check runs](https://github.com/getsentry/" repo:Repository "/commit/" revision:CheckRunsRevision "/checks" "/"? ")" LineBoundary {
      return { repo, mergeTarget, revision };
    }

CheckRunsRevision
  = value:$[0-9a-f]+ &{
      return value.length === 40;
    } {
      const range = location();
      return { value, start: range.start.offset, end: range.end.offset };
    }

CheckRunsLinkCount
  = entries:(CheckRunsLink / . { return false; })* !. { return entries.filter(Boolean).length; }

CheckRunsLink
  = "- [View check runs](" { return true; }

Indent
  = [ \t]*

BlankLines
  = (Indent Newline)*

LineBoundary
  = Newline
  / !.

Newline
  = "\r\n"
  / "\n"

NonNewline
  = [^\r\n]+

MergeTarget
  = "(default)"
  / characters:[A-Za-z0-9_./-]+ { return join(characters); }

LinkDestination
  = [^\r\n)]+
