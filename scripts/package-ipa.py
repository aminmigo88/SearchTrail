import pathlib, plistlib, sys, zipfile
app = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
with (app / 'Info.plist').open('rb') as f:
    app_info = plistlib.load(f)
if not (app / app_info['CFBundleExecutable']).is_file():
    raise SystemExit('Missing app executable')
extensions = list((app / 'PlugIns').glob('*.appex'))
safari = []
for extension in extensions:
    with (extension / 'Info.plist').open('rb') as f:
        info = plistlib.load(f)
    if info.get('NSExtension', {}).get('NSExtensionPointIdentifier') == 'com.apple.Safari.web-extension':
        if not info['CFBundleIdentifier'].startswith(app_info['CFBundleIdentifier'] + '.'):
            raise SystemExit('Safari extension identifier must be a child of the app identifier')
        safari.append(extension)
        executable = extension / info['CFBundleExecutable']
        if not executable.is_file():
            raise SystemExit('Missing Safari extension executable')
        if not list(extension.rglob('manifest.json')):
            raise SystemExit('Missing web extension resources')
if len(safari) != 1:
    raise SystemExit('Expected exactly one embedded Safari web extension')
destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in app.rglob('*'):
        if file.is_file():
            archive.write(file, pathlib.Path('Payload') / app.name / file.relative_to(app))
print(destination)
