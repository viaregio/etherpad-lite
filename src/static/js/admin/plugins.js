$(document).ready(function () {
  
  var socket,
    loc = document.location,
    port = loc.port == "" ? (loc.protocol == "https:" ? 443 : 80) : loc.port,
    url = loc.protocol + "//" + loc.hostname + ":" + port + "/",
    pathComponents = location.pathname.split('/'),
    // Strip admin/plugins
    baseURL = pathComponents.slice(0,pathComponents.length-2).join('/') + '/',
    resource = baseURL.substring(1) + "socket.io";

  //connect
  var room = url + "pluginfw/installer";
  socket = io.connect(room, {'path': baseURL + "socket.io", 'resource': resource});

  function search(searchTerm, limit) {
    if(search.searchTerm != searchTerm) {
      search.offset = 0
      search.results = []
      search.end = false
    }
    limit = limit? limit : search.limit
    search.searchTerm = searchTerm;
    socket.emit("search", {searchTerm: searchTerm, offset:search.offset, limit: limit, sortBy: search.sortBy, sortDir: search.sortDir});
    search.offset += limit;
    
    $('#search-progress').show()
    search.messages.show('fetching')
    search.searching = true
  }
  search.searching = false;
  search.offset = 0;
  search.limit = 999;
  search.results = [];
  search.sortBy = 'name';
  search.sortDir = /*DESC?*/true;
  search.end = true;// have we received all results already?
  search.messages = {
    show: function(msg) {
      //$('.search-results .messages').show()
      $('.search-results .messages .'+msg+'').show()
      $('.search-results .messages .'+msg+' *').show()
    },
    hide: function(msg) {
      $('.search-results .messages').hide()
      $('.search-results .messages .'+msg+'').hide()
      $('.search-results .messages .'+msg+' *').hide()
    }
  }

  var installed = {
    progress: {
      show: function(plugin, msg) {
        $('.installed-results .'+plugin+' .progress').show()
        $('.installed-results .'+plugin+' .progress .message').text(msg)
        if($(window).scrollTop() > $('.'+plugin).offset().top)$(window).scrollTop($('.'+plugin).offset().top-100)
      },
      hide: function(plugin) {
        $('.installed-results .'+plugin+' .progress').hide()
        $('.installed-results .'+plugin+' .progress .message').text('')
      }
    },
    messages: {
      show: function(msg) {
        $('.installed-results .messages').show()
        $('.installed-results .messages .'+msg+'').show()
      },
      hide: function(msg) {
        $('.installed-results .messages').hide()
        $('.installed-results .messages .'+msg+'').hide()
      }
    },
    list: []
  }

  function displayPluginList(plugins, container, template) {
    plugins.forEach(function(plugin) {
      var row = template.clone();
      
      for (attr in plugin) {
        if(attr == "name"){ // Hack to rewrite URLS into name
          row.find(".name").html("<a target='_blank' title='Plugin details' href='https://npmjs.org/package/"+plugin['name']+"'>"+plugin['name'].substr(3)+"</a>"); // remove 'ep_'
        }else{
          row.find("." + attr).text(plugin[attr]);
        }
      }
      row.find(".version").html( plugin.version );
      row.addClass(plugin.name)
      row.data('plugin', plugin.name)
      container.append(row);
    })
    updateHandlers();
  }
  
  function sortPluginList(plugins, property, /*ASC?*/dir) {
    return plugins.sort(function(a, b) {
      if (a[property] < b[property])
         return dir? -1 : 1;
      if (a[property] > b[property])
         return dir? 1 : -1;
      // a must be equal to b
      return 0;
    })
  }

  function updateHandlers() {
    // Search
    $("#search-query").unbind('keyup').keyup(function () {
      search($("#search-query").val());
    });
    
    // Prevent form submit
    $('#search-query').parent().bind('submit', function() {
      return false;
    });

    // update & install
    $(".do-install, .do-update").unbind('click').click(function (e) {
      var $row = $(e.target).closest("tr")
        , plugin = $row.data('plugin');
      if($(this).hasClass('do-install')) {
        $row.remove().appendTo('#installed-plugins')
        installed.progress.show(plugin, 'Installing')
      }else{
        installed.progress.show(plugin, 'Updating')
      }
      socket.emit("install", plugin);
      installed.messages.hide("nothing-installed")
    });

    // uninstall
    $(".do-uninstall").unbind('click').click(function (e) {
      var $row = $(e.target).closest("tr")
        , pluginName = $row.data('plugin');
      socket.emit("uninstall", pluginName);
      installed.progress.show(pluginName, 'Uninstalling')
      installed.list = installed.list.filter(function(plugin) {
        return plugin.name != pluginName
      })
    });

    // Sort
    $('.sort.up').unbind('click').click(function() {
      search.sortBy = $(this).attr('data-label').toLowerCase();
      search.sortDir = false;
      search.offset = 0;
      search(search.searchTerm, search.results.length);
      search.results = [];
    })
    $('.sort.down, .sort.none').unbind('click').click(function() {
      search.sortBy = $(this).attr('data-label').toLowerCase();
      search.sortDir = true;
      search.offset = 0;
      search(search.searchTerm, search.results.length);
      search.results = [];
    })
  }

  socket.on('results:search', function (data) {
    if(!data.results.length) search.end = true;
    if(data.query.offset == 0) search.results = [];
    search.messages.hide('nothing-found')
    search.messages.hide('fetching')
    $("#search-query").removeAttr('disabled')
    
    console.log('got search results', data)

    // add to results
    search.results = search.results.concat(data.results);

    // Update sorting head
    $('.sort')
      .removeClass('up down')
      .addClass('none');
    $('.search-results thead th[data-label='+data.query.sortBy+']')
      .removeClass('none')
      .addClass(data.query.sortDir? 'up' : 'down');

    // re-render search results
    var searchWidget = $(".search-results");
    searchWidget.find(".results *").remove();
    if(search.results.length > 0) {
      displayPluginList(search.results, searchWidget.find(".results"), searchWidget.find(".template tr"))
    }else {
      search.messages.show('nothing-found')
    }
    search.messages.hide('fetching')
    $('#search-progress').hide()
    search.searching = false
  });

  socket.on('results:installed', function (data) {
    installed.messages.hide("fetching")
    installed.messages.hide("nothing-installed")

    installed.list = data.installed
    sortPluginList(installed.list, 'name', /*ASC?*/true);

    // filter out epl
    installed.list = installed.list.filter(function(plugin) {
      return plugin.name != 'ep_etherpad-lite'
    })

    // remove all installed plugins (leave plugins that are still being installed)
    installed.list.forEach(function(plugin) {
      $('#installed-plugins .'+plugin.name).remove()
    })

    if(installed.list.length > 0) {
      displayPluginList(installed.list, $("#installed-plugins"), $("#installed-plugin-template"));
      socket.emit('checkUpdates');
    }else {
      installed.messages.show("nothing-installed")
    }
  });
  
  socket.on('results:updatable', function(data) {
    data.updatable.forEach(function(pluginName) {
      var $row = $('#installed-plugins > tr.'+pluginName)
        , actions = $row.find('.actions')
      actions.append('<input class="do-update" type="button" value="Update" />')
    })
    updateHandlers();
  })

  socket.on('finished:install', function(data) {
    if(data.error) {
      if(data.code === "EPEERINVALID"){
        alert("This plugin requires that you update Etherpad so it can operate in it's true glory");
      }
      alert('An error occured while installing '+data.plugin+' \n'+data.error)
      $('#installed-plugins .'+data.plugin).remove()
    }

    socket.emit("getInstalled");

    // update search results
    search.offset = 0;
    search(search.searchTerm, search.results.length);
    search.results = [];
  })

  socket.on('finished:uninstall', function(data) {
    if(data.error) alert('An error occured while uninstalling the '+data.plugin+' \n'+data.error)

    // remove plugin from installed list
    $('#installed-plugins .'+data.plugin).remove()
    
    socket.emit("getInstalled");

    // update search results
    search.offset = 0;
    search(search.searchTerm, search.results.length);
    search.results = [];
  })

  // init
  updateHandlers();
  socket.emit("getInstalled");
  search('');

  // check for updates every 5mins
  setInterval(function() {
    socket.emit('checkUpdates');
  }, 1000*60*5)
});
