//WORK IN PROGRESS

var DeployerTool = {

	name: "deployerTool",

	preferences: {
		deploy_list: []
	},

	init: function()
	{
		console.log("init in deployer");
		LiteGUI.menubar.add("Project/Deploy", { callback: function() { DeployerTool.showDialog(); }});

		//load local settings
	},

	showDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog( { title: "Deploy", close: true, width: 600, height: 350, scroll: false, draggable: true } );

		var area = new LiteGUI.Area({width:"100%",height:"100%"});
		area.split("horizontal",["40%",null]);
		dialog.add(area);
		
		var inspector_left = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		area.getSection(0).add( inspector_left );

		var tabs_right = new LiteGUI.Tabs();
		area.getSection(1).add( tabs_right );

		var deploy_tab = tabs_right.addTab( "deploy", {title:"Deploy", width: "100%"});
		var settings_tab = tabs_right.addTab( "settings",{title:"Settings", width: "100%"});
		var help_tab = tabs_right.addTab( "help",{title:"Help", width: "100%", content:"<p>The deploy system allows to send all the files of a project to a remote server. This way you don't need to do it manually.</p><p>To work you need to install the deployer script in the server where you want to deploy your project.</p><p>For more info check the guide.</p>"});

		var inspector_deploy = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		deploy_tab.add( inspector_deploy );

		var inspector_settings = new LiteGUI.Inspector( null, { scroll: true, resizable: true, full: true});
		settings_tab.add( inspector_settings );

		var selected = null;
		var deploy_list = DeployerTool.preferences.deploy_list;

		inspector_left.on_refresh = function()
		{
			inspector_left.clear();
			inspector_left.addTitle("Configs");

			var list = [];
			for(var i in deploy_list)
				list.push({content: deploy_list[i].title, item: deploy_list[i], selected: selected == deploy_list[i] });
			inspector_left.addList(null, list, { height: 280, callback: function(v){
				selected = v.item;
				inspector_deploy.refresh();
				inspector_settings.refresh();
			}});
			inspector_left.addButton(null,"Add Deploy Settings", { callback: function(){
				var new_deploy = {
					title:"New deploy",
					server:"webglstudio.org"
				};
				deploy_list.push( new_deploy );
				inspector_left.refresh();
			}});
		}

		inspector_deploy.on_refresh = function()
		{
			inspector_deploy.clear();
			if(!selected)
				return;
			var password = "";
			var info = null;
			var log_lines = [];

			inspector_deploy.addInfo(null,"Deploying a project will overwrite all the files in the destination server.");
			inspector_deploy.addString("Password",password,{ password: true, callback: function(v){ password = v; }});
			inspector_deploy.addButton(null,"Deploy project", { disabled: !selected.url, className:"big", callback: function(v){

				var r = that.deployToServer( selected, password, 
					function(v){
						log( v.msg, v.status != 1 ? "color: #F66" : "" );
					}, function(err){
						log(err,"color: #F66");
					}, function(v,lines){
						log(v,"color: #6F6");
					});
				if(r == true)
					log("Deploying...");
			}});

			info = inspector_deploy.addInfo(null,"",{ height: 160 });
			var winfo = info.querySelector(".winfo");
			winfo.style.backgroundColor = "black";
			winfo.style.fontSize = "0.8em";

			function log(v,style)
			{
				style = style || "";
				log_lines.push( "<p style='"+style+"'>" + String(v) + "</p>" );
				info.setValue( log_lines.join("\n") );
				info.scrollToBottom();
			}

			inspector_deploy.addButton(null,"Clear", function(){
				log_lines = [];
				log("Clear");
			});
		}

		inspector_settings.on_refresh = function()
		{
			inspector_settings.clear();
			if(!selected)
				return;
			inspector_settings.addString("Title", selected.title, { callback: function(v){ selected.title = v; inspector_left.refresh(); }});
			inspector_settings.addString("URL", selected.url, { placeHolder: "url to the deployer folder", callback: function(v){ selected.url = v; inspector_deploy.refresh(); }});
			inspector_settings.addString("Folder", selected.folder, { placeHolder: "to which folder to deploy", callback: function(v){ selected.folder = v; inspector_deploy.refresh(); }});
			inspector_settings.addString("Test URL", selected.test_url || "", { placeHolder: "final URL to test deploy", callback: function(v){ selected.test_url = v; }});
			inspector_settings.addTextarea("Comments", selected.comments || "", { height: 140, callback: function(v){ selected.comments = v; }});
			inspector_settings.addButtons(null,["Test","Delete"], { callback: function(v) {
				if(v == "Test")
				{
					DeployerTool.testServer( selected );
				}
				else if(v == "Delete")
				{
					var index = deploy_list.indexOf(selected);
					if(index == -1)
						return;
					deploy_list.splice(index,1);
					selected = null;
					inspector_left.refresh();
					inspector_deploy.refresh();
					inspector_settings.refresh();
				}
			}});
		}

		inspector_left.refresh();
		inspector_deploy.refresh();
		inspector_settings.refresh();

		dialog.show();
	},

	log: function(v)
	{

		console.log(v);
	},

	deployToServer: function( server_info, password, on_complete, on_error, on_progress )
	{
		//check
		var res = DriveModule.getResourcesNotSaved();
		if(res && res.length)
		{	
			LiteGUI.alert("There are resources in memory that must be saved in order to deploy.");
			return false;
		}

		var scene = LS.GlobalScene;
		if(!scene.extra || !scene.extra.folder)
		{
			LiteGUI.alert("Save the scene in the server before deploying it.");
			return false;
		}

		var fullpath = scene.extra.folder + "/" + scene.extra.filename;

		var config = {};
		config.base_path = location.href + "/" + LS.RM.path + "/";
		config.project_folder = server_info.folder || "";
		config.scene = fullpath;
		config.files = [];

		//resources
		var resources = scene.getResources(null,null,true,true); //skip in pack/prefab
		for(var i in resources)
		{
			if(i[0] == ":")
				continue; //private files
			if( !LS.RM.getExtension(i) )
				continue; //files without extension are not supported
			config.files.push(i);
		}

		//server
		var server_url = server_info.url + "/deployer.php";
		var token = null;

		//request
		LiteGUI.request( { 
			url: server_url, 
			dataType: "json", 
			data: {
				key: password,
				info: JSON.stringify( config, null, 5 )
			},
			success: function(v){
				if(v.status != 1)
				{
					LiteGUI.alert("Error deploying: " + v.msg );
					if(on_complete)
						on_complete(v);
					return;
				}
				console.log(v);
				token = v.token;
				setTimeout( check_status, 1000 );
			},
			error: function(err){
				if(on_error)
					on_error(err);
				LiteGUI.alert("Error connecting with deploy server, check the url and that the deployer.php script is installed in the remote machine.");
			}
		});

		var log_lines = [];

		function check_status()
		{
			LiteGUI.request({url: server_url, dataType:"json", data:{ action:"report",token: token }, success: function(v){
				if(v.status != 1)
				{
					console.error(v.msg);
					return;
				}

				var lines = v.log.split("\\n");
				if(on_progress)
				{
					for(var i = log_lines.length; i < lines.length; ++i)
						on_progress(lines[i]);
				}
				log_lines = lines;

				if( lines[ lines.length - 1 ] == "" && lines[ lines.length - 2 ] == "DONE")
				{
					if(on_complete)
						on_complete({status:1,msg:"done"});
					LiteGUI.request({ url: server_url, data: { action:"end", token: token }, success: function(v){ console.log("deploy end",v);}});
					return;
				}
				//setTimeout( check_status, 1000 );
			}});
		}

		return true;
	},

	testServer: function( server_info )
	{
		var url = server_info.url;
		if( url.indexOf("deployer.php") == -1 )
			url += "/deployer.php";

		LiteGUI.requestJSON( url + "?action=test", function(v){
			if(v.status != 1)
				LiteGUI.alert( "Error in server:" + v.msg, { width: 400 } );
			else
				LiteGUI.alert( "Connection stablished" );
		}, function(err){
			LiteGUI.alert("Error, no server found");
		});
	}
};

DeployerTool.init();


