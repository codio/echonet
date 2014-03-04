fs = require 'fs'
{expect} = require 'chai'
q = require 'q'
moment = require 'moment'

bot = require '../lib/lxc-bot'

simpleOutput = fs.createReadStream 'test/fixtures/simple.txt'


describe 'lxc-bot', ->
  describe '_parse', ->
    it 'parses a simple output', ->
      result = bot._parse simpleOutput
      q.all [
        expect(result).to.eventually.be.an 'array'
        expect(result).to.eventually.have.length 5
        result.then (val) -> expect(val[0]).to.be.eql
          container: 'be35019f81e93763d8ba37e3b89871e1ad28950ce2b6164e6df03d48a9f9fdff'
          user: 'root'
          pid: 3498
          cpu: 0.0
          mem: 0.1
          vsz: 73444
          rss:  3596
          tty: '?'
          stat: 'Ss'
          start: moment '10:09', 'HH:mm'
          time: '0:00'
          command: 'sshd: codio [priv]'
      ]
