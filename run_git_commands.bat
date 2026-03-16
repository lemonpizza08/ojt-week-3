@echo off
cd /d f:\ojtweek2
echo Running: git rm --cached server/.env
git rm --cached server/.env
echo.
echo Running: git rm --cached server/credentials.json
git rm --cached server/credentials.json
echo.
echo Running: git status
git status
