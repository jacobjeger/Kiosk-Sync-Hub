~/workspace$ echo "# Kiosk-Sync-Hub" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/jacobjeger/Kiosk-Sync-Hub.git
git push -u origin main
Reinitialized existing Git repository in /home/runner/workspace/.git/
[main 8cbfb42] first commit
 1 file changed, 1 insertion(+)
 create mode 100644 README.md
error: remote origin already exists.
Enumerating objects: 549, done.
Counting objects: 100% (549/549), done.
Delta compression using up to 8 threads
Compressing objects: 100% (515/515), done.
Writing objects: 100% (549/549), 9.82 MiB | 5.05 MiB/s, done.
Total 549 (delta 272), reused 0 (delta 0), pack-reused 0 (from 0)
remote: Resolving deltas: 100% (272/272), done.
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: 
remote: - GITHUB PUSH PROTECTION
remote:   —————————————————————————————————————————
remote:     Resolve the following violations before pushing again
remote: 
remote:     - Push cannot contain secrets
remote: 
remote:     
remote:      (?) Learn how to resolve a blocked push
remote:      https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push
remote:     
remote:     
remote:       —— Supabase Secret Key ———————————————————————————————
remote:        locations:
remote:          - commit: 2fce73cebef943f5a15b97d10379e3bef4b114c1
remote:            path: .replit:45
remote:          - commit: acac95515f7edf66de36c8907c4a7ed8e812b5c1
remote:            path: .replit:45
remote:          - commit: c8168a5212deeab646bd3de6c5b402444d7f4b25
remote:            path: .replit:45
remote:          - commit: 9c099ee6e32f98ef4d95697f60029ad3b17214f7
remote:            path: .replit:45
remote:          - commit: 64850debac0689cba398a2f0628b8b680599f4d8
remote:            path: .replit:46
remote:     
remote:        (?) To push, remove secret from commit(s) or follow this URL to allow the secret.
remote:        https://github.com/jacobjeger/Kiosk-Sync-Hub/security/secret-scanning/unblock-secret/3COosOtoz4ohN2b1AUM3JDaFpmx
remote:     
remote: 
remote: 
To https://github.com/jacobjeger/Kiosk-Sync-Hub
 ! [remote rejected] main -> main (push declined due to repository rule violations)
error: failed to push some refs to 'https://github.com/jacobjeger/Kiosk-Sync-Hub'
~/workspace$ 