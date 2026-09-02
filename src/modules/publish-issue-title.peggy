{
  function join(characters) {
    return characters.join("");
  }
}

// Canonical grammar for publish issue titles. A path suffix is syntactic only:
// the controller resolves a single segment as a workspace after checking out
// the CI-approved revision.
PublishIssueTitle
  = "publish: " "getsentry/"? repo:Repository path:Path? workspace:LegacyWorkspace? "@" version:Version !. {
      return {
        repo,
        path: path || "",
        version,
        ...(workspace ? { workspace } : {}),
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

LegacyWorkspace
  = " [workspace: " workspace:JsonString "] " { return workspace; }

JsonString
  = value:$("\"" JsonCharacter* "\"") { return value; }

JsonCharacter
  = [^"\\\u0000-\u001F]
  // JSON.parse provides the authoritative escape validation so malformed
  // legacy workspace values retain their existing clear diagnostic.
  / "\\" [^\u0000-\u001F]

Version
  = characters:[A-Za-z0-9_.+-]+ { return join(characters); }
