var AboutModule = {
	name: "about",

	init: function()
	{
		LiteGUI.menubar.add("About", { callback: function() { 
			var dialog = new LiteGUI.Dialog({ title: "About WebGLStudio", closable: true, width: 400, height: 240} );
			dialog.content.style.fontSize = "2em";
			dialog.content.style.backgroundColor = "black";
			dialog.content.innerHTML = "<p>WebGLStudio version "+CORE.config.version+"</p><p>Created by <a href='http://blog.tamats.com' target='_blank'>Javi Agenjo</a></p><p><a href='http://gti.upf.edu/' target='_blank'>GTI department</a> of <a href='http://www.upf.edu' target='_blank'>Universitat Pompeu Fabra</a></p><p><a target='_blank' href='https://github.com/jagenjo/webglstudio.js'>Fork me in Github</a></a>";
			dialog.show();
		}});
	}
}

CORE.registerModule( AboutModule );