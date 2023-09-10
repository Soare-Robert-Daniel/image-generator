# Random Image Generator with Javascript (Node/Bun)

## Description

This is a simple CLI that generates a random image based on the user's input. The user can specify the width, height, and the number of images to generate.

Example:

```bash
node generate.js 1024 1024 5
```

```bash
bun run generate.js 1024 1024 5
```

Using GNU Parallel:

```bash
parallel 'node generate.js 1024 1024 5' ::: {1..5}
```
```bash
parallel 'bun run generate.js 1024 1024 5' ::: {1..5}
```

## Result

![example](./example.png)
