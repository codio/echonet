module.exports = (grunt) ->
  grunt.initConfig
    simplemocha:
      options:
        reporter: 'spec'
        compilers: ['coffee:coffee-script/register']

      all:
        src: [
          'test/setup.js'
          'test/**/*.spec.coffee'
        ]

    watch:
      all:
        files: ['lib/**/*.js', 'test/**/*']
        tasks: ['test']


  [
    'grunt-simple-mocha'
    'grunt-contrib-watch'
  ].forEach (task) -> grunt.loadNpmTasks task

  grunt.registerTask 'test', ['simplemocha']
  grunt.registerTask 'default', ['test']
