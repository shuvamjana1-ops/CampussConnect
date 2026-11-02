@echo off
cd d:\aws
pnpm test packages/domain -- schedule.property.test --run
