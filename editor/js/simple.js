//fast coding
var $ = document.querySelector.bind(document);
var $$ = document.querySelectorAll.bind(document);
var events = window.EventTarget || window.HTMLElement;
if(events)
{
	events.prototype.on = events.prototype.addEventListener;
	events.prototype.trigger = function(eventType) { var e = document.createEvent("HTMLEvents"); e.initEvent(eventType,true,true); this.dispatchEvent(e); }
}

var server_url = "../litefileserver/app/";
var context = null;

function init()
{
	$("#showmenu").on("click", function() {
		$("#menu").style.left = "0px";
		$("#showmenu").style.opacity = 0;
	});
	$("#hidemenu").on("click", function() {
		context.play();

		$("#menu").style.left = "-100px";
		$("#scenes").style.display = "none";
		$("#showmenu").style.opacity = 1;
		$("#settings").style.display = "none";
	});
	$("#showscenes").on("click", function() {
		context.pause();
		$("#scenes").style.display = "block";
	});

	$("#showoptions").on("click", function() {
		var div = $("#settings");
		div.style.display = div.style.display == "block" ? "none": "block";
	});


	serverGetFiles("scenes");

	//LiteSCENE CODE *************************
	context = new LS.Context({container_id: "visor", redraw: true,
			resources: "../litefileserver/app/resources/", 
			shaders: "../litescene/data/shaders.xml",
			proxy: "@/redirect/"
	});
	//auto rotate the camera
	context.onUpdate = function(dt)
	{
		Scene.getCamera().orbit(dt*5,[0,1,0])
	}

	//URL read to see which scene to load
	var session = getUrlVars()["session"];
	if(session)
	{
		var session_data = localStorage.getItem( session );
		if(!session_data)
			return alert("Scene not found: " + session);
		Scene.configure( JSON.parse(session_data) );
		Scene.loadResources( onReady );
		return;
	}

	//loads and triggers start
	var vars = getUrlVars();
	var url = vars["scene"];// || "../liteserver/resources/scenes/dirty lens.json";
	if(url)
		context.loadScene( url , onReady );
	else
		$("#showscenes").trigger("click");

	if(vars["low"])
		context.render_options["low_quality"] = true;
}

function onReady()
{
	showLoading(false);
	//if no controller, add one
	if( !Scene.root.hasComponent( LS.Components.CameraController ) )
	{
		console.log("Adding CameraController component")
		var comp = new LS.Components.CameraController();
		Scene.root.addComponent(comp);
	}
}


//get parameter vars
function getUrlVars() {
	var vars = [], hash; var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
	for(var i = 0; i < hashes.length; i++) { hash = hashes[i].split('='); vars.push(hash[0]);vars[hash[0]] = hash[1]; }
	return vars;
};


function serverGetFiles(folder, on_complete)
{
	LS.getJSON( server_url + "ajax.php?action=resources:getFilesByFolder&folder=" + folder )
	.done(function (response) {
		var root = $("#scenes .list");
		for(var i in response.data)
		{
			var file = response.data[i];
			//trace(file);
			file.server_id = file.id;
			file.fullpath = file.folder + "/" + file.filename;
			file.url = server_url + "resources/" + file.fullpath;
			file.object_type = file.category;
			if(file.metadata)
				file.metadata = JSON.parse( file.metadata );
			else
				file.metadata = {};
			file.preview_url = server_url + "resources/_pics/_" + file.id + ".png";

			var element = document.createElement("div");
			element.className = "item scene";
			//element.innerHTML = '<img src="' + file.preview_url + '"/><span class="title">'+file.filename+'</span>';
			var short_filename = file.filename.replace(".json","");
			short_filename = short_filename.replace("_"," ");
			element.innerHTML = '<span class="title">'+short_filename+'</span>';
			element.style.background = "url('"+file.preview_url+"') -25px";
			element.data = file;
			element.dataset["title"] = file.filename;
			element.dataset["url"] = file.url;
			element.on("click", function(e) { 
				context.play();
				LS.ResourcesManager.reset();//free memory
				showLoading(true);
				Scene.clear();
				context.loadScene( this.dataset["url"], onReady ); 

				//change address bar and web title
				var web_url = window.location.href;
				var pos = web_url.indexOf("?");
				if(pos != -1)
					web_url = window.location.href.substr(0,pos);
				var url = web_url + "?scene=" + this.dataset["url"];
				document.title = this.dataset["title"];
			    window.history.pushState({"pageTitle":document.title},"", url);

				$("#hidemenu").trigger("click"); });
			root.appendChild(element);
		}
		if(on_complete)
			on_complete(response.data)
	})
	.fail(function (err) {
		console.error("Error in serverGetFiles: ", err );
	});
}

function showLoading(v)
{
	var div = $("#loading");
	div.style.display = v ? "block" : "none";
	div.style.left = (document.body.clientWidth * 0.5 - 20).toFixed(0) + "px";
	div.style.top = (document.body.clientHeight * 0.5 - 20).toFixed(0) + "px";
}
