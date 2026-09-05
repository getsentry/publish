{
  function join(characters) {
    return characters.join("");
  }
}

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
