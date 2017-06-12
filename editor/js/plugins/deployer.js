//WORK IN PROGRESS

var DeployerTool = {

	name: "deployerTool",

	settings: {
		deploy_list: []
	},

	init: function()
	{
		LiteGUI.menubar.add("Project/Deploy", { callback: function() { DeployerTool.showDialog(); }});

		//load local settings

	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Project/Deploy");
	},

	showDialog: function()
	{
		var dialog = new LiteGUI.Dialog( { title: "Deploy", close: true, width: 500, height: 250, scroll: false, draggable: true } );

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
		var deploy_list = DeployerTool.settings.deploy_list;

		inspector_left.on_refresh = function()
		{
			inspector_left.clear();
			inspector_left.addTitle("Configs");

			var list = [];
			for(var i in deploy_list)
				list.push({content: deploy_list[i].title, item: deploy_list[i], selected: selected == deploy_list[i] });
			inspector_left.addList(null, list, { height: 230, callback: function(v){
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
			inspector_deploy.addInfo(null,"Deploying a project will overwrite all the files in the destination server.");
			inspector_deploy.addCheckbox("Deploy all",true,{});
			inspector_deploy.addString("Password","",{ password: true });
			inspector_deploy.addButton(null,"Deploy project", { className:"big" });
		}

		inspector_settings.on_refresh = function()
		{
			inspector_settings.clear();
			if(!selected)
				return;
			inspector_settings.addString("Title", selected.title, { callback: function(v){ selected.title = v; inspector_left.refresh(); }});
			inspector_settings.addString("URL", selected.url, { placeHolder: "url to the deployer folder", callback: function(v){ selected.url = v; }});
			inspector_settings.addString("Folder", selected.folder, { placeHolder: "to which folder to deploy", callback: function(v){ selected.folder = v; }});
			inspector_settings.addString("Test URL", selected.test_url || "", { placeHolder: "final URL to test deploy", callback: function(v){ selected.test_url = v; }});
			inspector_settings.addTextarea("Comments", selected.comments || "", { height: 140, callback: function(v){ selected.comments = v; }});
			inspector_settings.addButtons(null,["Test","Save","Delete"], { callback: function(v) {
				if(v == "Test")
				{
					DeployerTool.testServer( selected );
				}
				else if(v == "Save")
				{
					//TODO				
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
		dialog.adjustSize();
	},

	deployToServer: function( server_info, password, on_complete, on_progress )
	{
		//check
		var res = this.getResourcesNotSaved();
		if(res && res.length)
			return LiteGUI.alert("There are resources in memory that must be saved in order to deploy.");

		var scene = LS.GlobalScene;
		if(!scene.extra || !scene.extra.folder)
			return LiteGUI.alert("Save the scene in the server before deploying it.");

		var config = {};

		
	},

	testServer: function( info )
	{
		//TODO
	}
};

CORE.registerModule( DeployerTool );

