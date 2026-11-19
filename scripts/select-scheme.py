import json, sys
data = json.load(open(sys.argv[1]))
schemes = data.get('project', data.get('workspace', {})).get('schemes', [])
exact = [s for s in schemes if s == 'SearchTrail (iOS)']
apps = [s for s in schemes if 'SearchTrail' in s and 'Extension' not in s]
if exact:
    print(exact[0])
elif len(apps) == 1:
    print(apps[0])
else:
    raise SystemExit('Cannot select an unambiguous app scheme. Available: ' + repr(schemes))
