New-Item -ItemType Directory -Force -Path "e:\OXYBIO\public\.well-known"
Copy-Item -Path "C:\Users\manis\Downloads\New folder\assetlinks.json" -Destination "e:\OXYBIO\public\.well-known\assetlinks.json"
cd e:\OXYBIO
git add public\.well-known\assetlinks.json
git commit -m "Include assetlinks for Google Play Console"
git push
