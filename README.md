phabulist
=========

Tools for Phabricator

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/phabulist.svg)](https://npmjs.org/package/phabulist)
[![Downloads/week](https://img.shields.io/npm/dw/phabulist.svg)](https://npmjs.org/package/phabulist)
[![License](https://img.shields.io/npm/l/phabulist.svg)](https://github.com/davidbarratt/phabulist/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g phabulist
$ phabulist COMMAND
running command...
$ phabulist (-v|--version|version)
phabulist/1.0.0 linux-x64 node-v14.15.4
$ phabulist --help [COMMAND]
USAGE
  $ phabulist COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`phabulist help [COMMAND]`](#phabulist-help-command)
* [`phabulist replicate`](#phabulist-replicate)

## `phabulist help [COMMAND]`

display help for phabulist

```
USAGE
  $ phabulist help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.2/src/commands/help.ts)_

## `phabulist replicate`

Duplicate tasks from one project to another

```
USAGE
  $ phabulist replicate
```

_See code: [src/commands/replicate.ts](https://github.com/davidbarratt/phabulist/blob/v1.0.0/src/commands/replicate.ts)_
<!-- commandsstop -->
